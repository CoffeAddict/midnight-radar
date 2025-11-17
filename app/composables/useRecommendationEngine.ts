import { getMusicFingerprintFromIndexedDB } from '~/utils/indexedDb'

export interface Recommendation {
  title: string
  artist: string
  mrid: string
}

interface RecommendationEngineOptions {
  fingerprint?: Awaited<ReturnType<typeof getMusicFingerprintFromIndexedDB>>
}

interface FingerprintGenre {
  name: string
  score: number
}

// Decoded track interface
interface DecodedLikedTrack {
  artist: string
  name: string
  added_at?: string
}

const DISCOVER_ENDPOINT = '/api/discover'
const TARGET_RECOMMENDATIONS = 10
const GENRE_BATCH_SIZE = 10
const MIN_GENRE_POOL = 5
const DISCOVER_LIMIT = 10

interface DiscoverRecording {
  id?: string
  title?: string
  'artist-credit'?: Array<{ name?: string }>
  isrcs?: string[]
  releases?: Array<{ barcode?: string; id?: string }>
}

interface DiscoverResponse {
  recordings?: DiscoverRecording[]
}

/**
 * Validates fingerprint format
 * Throws error if old object format is detected
 */
const validateFingerprintFormat = (fingerprint: any) => {
  // Check if artists is string[] (new format)
  if (!Array.isArray(fingerprint.taste.artists)) {
    throw new Error('Invalid fingerprint format: artists must be an array. Please regenerate your fingerprint.')
  }

  if (fingerprint.taste.artists.length > 0 && typeof fingerprint.taste.artists[0] !== 'string') {
    throw new Error('Incompatible fingerprint format detected. Please regenerate your fingerprint using the "Fetch Spotify data" button.')
  }

  // Check if liked_tracks is string[] (new format)
  if (!Array.isArray(fingerprint.taste.liked_tracks)) {
    throw new Error('Invalid fingerprint format: liked_tracks must be an array. Please regenerate your fingerprint.')
  }

  if (fingerprint.taste.liked_tracks.length > 0 && typeof fingerprint.taste.liked_tracks[0] !== 'string') {
    throw new Error('Incompatible fingerprint format detected. Please regenerate your fingerprint using the "Fetch Spotify data" button.')
  }
}

export const useRecommendationEngine = () => {
  const generateRecommendations = async (
    options: RecommendationEngineOptions = {}
  ): Promise<Recommendation[]> => {
    const fingerprint =
      options.fingerprint ?? (await getMusicFingerprintFromIndexedDB().catch(() => null))

    if (!fingerprint || !Array.isArray(fingerprint.taste.genres)) {
      throw new Error('No fingerprint found. Cannot generate recommendations.')
    }

    // Validate format (throws if old format detected)
    validateFingerprintFormat(fingerprint)

    const genres = fingerprint.taste.genres as FingerprintGenre[]

    if (genres.length === 0) {
      throw new Error('Fingerprint does not contain genre data.')
    }

    const likedIdentifiers = new Set<string>()
    const likedArtistTitlePairs = new Set<string>()

    const encodedTracks = fingerprint.taste.liked_tracks as string[]
    for (const encodedTrack of encodedTracks) {
      if (!encodedTrack || typeof encodedTrack !== 'string') {
        continue
      }

      try {
        const track = decodeTrack(encodedTrack)

        // Use artist+title pairs for deduplication against user's liked tracks
        if (track.artist && track.name) {
          likedArtistTitlePairs.add(buildArtistTitleKey(track.artist, track.name))
        }
      } catch (error) {
        // Skip invalid encoded tracks
        console.warn('Failed to decode track:', encodedTrack, error)
      }
    }

    const weightedGenres = buildWeightedGenreList(genres, GENRE_BATCH_SIZE)
    const recommendationPool = new Map<string, DiscoverRecording[]>()
    const recommendations: Recommendation[] = []

    for (const genre of weightedGenres) {
      const record = await getRecommendationForGenre({
        genre,
        poolMap: recommendationPool,
        likedIdentifiers,
        likedPairs: likedArtistTitlePairs
      })

      if (!record) {
        continue
      }

      const isrc = record.isrcs?.[0]
      const barcode = record.releases?.find((release) => release?.barcode)?.barcode
      const identifier = isrc ?? barcode ?? record.id

      if (identifier) {
        likedIdentifiers.add(identifier.toLowerCase())
      }

      const recordingArtist = record['artist-credit']?.[0]?.name ?? ''
      const recordingTitle = record.title ?? ''

      if (recordingArtist && recordingTitle) {
        likedArtistTitlePairs.add(buildArtistTitleKey(recordingArtist, recordingTitle))
      }

      const artist = record['artist-credit']?.[0]?.name ?? 'Unknown artist'
      const title = record.title ?? 'Unknown title'

      recommendations.push({
        title,
        artist,
        mrid: generateMRID(artist, title)
      })

      if (recommendations.length >= TARGET_RECOMMENDATIONS) {
        break
      }
    }

    return recommendations.slice(0, TARGET_RECOMMENDATIONS)
  }

  return {
    generateRecommendations
  }
}

const buildWeightedGenreList = (
  genres: FingerprintGenre[],
  count: number
): string[] => {
  const normalized = normalizeGenreWeights(genres)
  const selections: string[] = []

  for (let i = 0; i < count; i += 1) {
    selections.push(weightedRandomPick(normalized))
  }

  return selections
}

const normalizeGenreWeights = (
  genres: FingerprintGenre[]
): Array<{ name: string; weight: number }> => {
  const total = genres.reduce((sum, genre) => sum + (genre.score || 0), 0)

  if (total <= 0) {
    const fallbackWeight = 1 / genres.length
    return genres.map((genre) => ({ name: genre.name, weight: fallbackWeight }))
  }

  return genres.map((genre) => ({
    name: genre.name,
    weight: genre.score / total
  }))
}

const weightedRandomPick = (genres: Array<{ name: string; weight: number }>): string => {
  const target = Math.random()
  let cumulative = 0

  for (const genre of genres) {
    cumulative += genre.weight
    if (target <= cumulative) {
      return genre.name
    }
  }

  return genres[genres.length - 1]?.name ?? genres[0]?.name ?? 'unknown'
}

const ensureGenrePool = async ({
  genre,
  limit,
  pool,
  likedIdentifiers,
  likedPairs,
  minPoolSize
}: {
  genre: string
  limit: number
  pool: DiscoverRecording[]
  likedIdentifiers: Set<string>
  likedPairs: Set<string>
  minPoolSize: number
}) => {
  const poolIdentifiers = new Set<string>(
    pool
      .map((record) =>
        record.isrcs?.[0] ?? record.releases?.find((release) => release?.barcode)?.barcode ?? record.id
      )
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.toLowerCase())
  )

  const poolPairs = new Set<string>(
    pool
      .map((record) =>
        record['artist-credit']?.[0]?.name && record.title
          ? buildArtistTitleKey(record['artist-credit']?.[0]?.name ?? '', record.title ?? '')
          : null
      )
      .filter((value): value is string => typeof value === 'string')
  )

  let attempts = 0

  while (attempts < 5 && pool.length < minPoolSize) {
    const response = await fetchDiscover(genre, limit)
    const recordings = response.recordings ?? []

    for (const recording of recordings) {
      if (!recording || !recording.title) {
        continue
      }

      const isrc = recording.isrcs?.[0]
      const barcode = recording.releases?.find((release) => release?.barcode)?.barcode
      const identifier = isrc ?? barcode ?? recording.id

      if (
        identifier &&
        (likedIdentifiers.has(identifier.toLowerCase()) || poolIdentifiers.has(identifier.toLowerCase()))
      ) {
        continue
      }

      const recordingArtist = recording['artist-credit']?.[0]?.name ?? ''
      const recordingTitle = recording.title ?? ''
      const pairKey =
        recordingArtist && recordingTitle
          ? buildArtistTitleKey(recordingArtist, recordingTitle)
          : null

      if (pairKey && (likedPairs.has(pairKey) || poolPairs.has(pairKey))) {
        continue
      }

      pool.push(recording)

      if (identifier) {
        poolIdentifiers.add(identifier.toLowerCase())
      }

      if (pairKey) {
        poolPairs.add(pairKey)
      }
    }

    attempts += 1

    if (recordings.length === 0) {
      break
    }
  }
}

const fetchDiscover = async (genre: string, limit: number): Promise<DiscoverResponse> => {
  return await $fetch<DiscoverResponse>(DISCOVER_ENDPOINT, {
    query: {
      genre,
      limit: limit.toString()
    }
  })
}

const buildArtistTitleKey = (artist: string, title: string) =>
  `${artist}`.trim().toLowerCase() + '::' + `${title}`.trim().toLowerCase()

const getRecommendationForGenre = async ({
  genre,
  poolMap,
  likedIdentifiers,
  likedPairs
}: {
  genre: string
  poolMap: Map<string, DiscoverRecording[]>
  likedIdentifiers: Set<string>
  likedPairs: Set<string>
}): Promise<DiscoverRecording | null> => {
  const pool = poolMap.get(genre) ?? []
  poolMap.set(genre, pool)

  await ensureGenrePool({
    genre,
    limit: DISCOVER_LIMIT,
    pool,
    likedIdentifiers,
    likedPairs,
    minPoolSize: MIN_GENRE_POOL
  })

  let attempts = 0

  while (attempts < 5) {
    while (pool.length) {
      const record = pool.shift()

      if (!record) {
        continue
      }

      const isrc = record.isrcs?.[0]
      const barcode = record.releases?.find((release) => release?.barcode)?.barcode
      const identifier = isrc ?? barcode ?? record.id

      if (identifier && likedIdentifiers.has(identifier.toLowerCase())) {
        continue
      }

      const recordingArtist = record['artist-credit']?.[0]?.name ?? ''
      const recordingTitle = record.title ?? ''

      if (recordingArtist && recordingTitle) {
        const key = buildArtistTitleKey(recordingArtist, recordingTitle)
        if (likedPairs.has(key)) {
          continue
        }
      }

      poolMap.set(genre, pool)
      return record
    }

    attempts += 1

    await ensureGenrePool({
      genre,
      limit: DISCOVER_LIMIT,
      pool,
      likedIdentifiers,
      likedPairs,
      minPoolSize: MIN_GENRE_POOL
    })
  }

  poolMap.set(genre, pool)
  return null
}
