import { getMusicFingerprintFromIndexedDB, reconstructObject } from '~/utils/indexedDb'

export interface Recommendation {
  title: string
  artist: string
  genre: string
  isrc?: string
  mbid?: string
}

interface RecommendationEngineOptions {
  fingerprint?: Awaited<ReturnType<typeof getMusicFingerprintFromIndexedDB>>
}

interface FingerprintGenre {
  name: string
  score: number
}

const DISCOVER_ENDPOINT = '/api/discover'
const TARGET_RECOMMENDATIONS = 10
const GENRE_BATCH_SIZE = 10
const MIN_GENRE_POOL = 5
const DISCOVER_LIMIT = 10
const MUSICBRAINZ_RATE_LIMIT_MS = 1000

let lastDiscoverRequestTime = 0

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

export const useRecommendationEngine = () => {
  const generateRecommendations = async (
    options: RecommendationEngineOptions = {}
  ): Promise<Recommendation[]> => {
    const fingerprint =
      options.fingerprint ?? (await getMusicFingerprintFromIndexedDB().catch(() => null))

    if (!fingerprint || !Array.isArray(fingerprint.keys) || !Array.isArray(fingerprint.data)) {
      throw new Error('No fingerprint found. Cannot generate recommendations.')
    }

    // Reconstruct all data items from columnar format
    const allItems = fingerprint.data.map((row) =>
      reconstructObject<Record<string, unknown>>(fingerprint.keys, row)
    )

    // Extract genres (items with type='genre')
    const genres = allItems
      .filter((item) => item.type === 'genre')
      .map((item) => ({
        name: item.name as string,
        score: item.score as number
      })) as FingerprintGenre[]

    if (genres.length === 0) {
      throw new Error('Fingerprint does not contain genre data.')
    }

    const likedIdentifiers = new Set<string>()
    const likedArtistTitlePairs = new Set<string>()

    // Extract liked tracks (items with type='track')
    const likedTracks = allItems.filter((item) => item.type === 'track')
    for (const track of likedTracks) {
      if (!track) {
        continue
      }

      const trackArtists = track.artists as Array<{ id?: string; name: string }> | undefined
      const primaryArtist = trackArtists?.[0]?.name ?? ''

      // Use artist+title pairs for deduplication against user's liked tracks
      if (primaryArtist && track.name) {
        likedArtistTitlePairs.add(buildArtistTitleKey(primaryArtist, track.name as string))
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

      recommendations.push({
        title: record.title ?? 'Unknown title',
        artist: record['artist-credit']?.[0]?.name ?? 'Unknown artist',
        genre,
        isrc,
        mbid: record.id
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
  const now = Date.now()
  const elapsed = now - lastDiscoverRequestTime

  if (elapsed < MUSICBRAINZ_RATE_LIMIT_MS) {
    await new Promise((resolve) => setTimeout(resolve, MUSICBRAINZ_RATE_LIMIT_MS - elapsed))
  }

  lastDiscoverRequestTime = Date.now()

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
