import { defineEventHandler, getHeader, getQuery, setResponseStatus } from 'h3'

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1'
const MAX_ARTIST_BATCH = 50
const LIKE_WEIGHT_DECAY_DAYS = 60
const LIKE_MIN_WEIGHT = 0.1
const FOLLOW_WEIGHT = 0.5

type ProgressStage = 'liked_tracks' | 'followed_artists' | 'artist_details'

interface SpotifySavedTrack {
  track: {
    id: string
    name: string
    external_ids?: Record<string, string>
    artists?: Array<{ id?: string }>
  } | null
  added_at?: string
}

interface SpotifySavedTracksResponse {
  items: SpotifySavedTrack[]
  next: string | null
  total?: number
  limit?: number
}

interface SpotifyFollowedArtistsResponse {
  artists: {
    items: Array<{
      id: string
      name: string
    }>
    next: string | null
    total?: number
  }
}

interface SpotifyArtistDetails {
  id: string
  name: string
  genres: string[]
}

interface SpotifyArtistsBatchResponse {
  artists: SpotifyArtistDetails[]
}

interface LikedTrack {
  id: string
  name: string
  external_ids?: Record<string, string>
  added_at?: string
}

interface NormalizedArtist {
  id: string
  name: string
  genres: string[]
}

interface GenreScore {
  name: string
  score: number
}

interface CachedSpotifyData {
  artists: NormalizedArtist[]
  liked_tracks: LikedTrack[]
  genres: GenreScore[]
}

interface ProgressUpdate {
  stage: ProgressStage
  ratio: number
  message: string
}

const spotifyCache = new Map<string, CachedSpotifyData>()

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization')

  if (!authorization || !authorization.startsWith('Bearer ')) {
    setResponseStatus(event, 400)
    return { error: 'Missing Spotify access token.' }
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()
  const query = getQuery(event)
  const forceRefresh = coerceBoolean(query.force)

  const response = event.node.res
  response.statusCode = 200
  response.setHeader('Content-Type', 'application/x-ndjson')
  response.setHeader('Cache-Control', 'no-cache, no-transform')
  response.setHeader('Connection', 'keep-alive')

  const writeNDJSON = (payload: unknown) => {
    response.write(`${JSON.stringify(payload)}\n`)
  }

  const sendComplete = (data: CachedSpotifyData, cached = false) => {
    writeNDJSON({
      type: 'complete',
      cached,
      data
    })
    response.end()
  }

  if (!forceRefresh) {
    const cached = spotifyCache.get(accessToken)
    if (cached) {
      sendComplete(cached, true)
      return
    }
  }

  const emitProgress = createProgressEmitter(writeNDJSON)

  try {
    emitProgress({ stage: 'liked_tracks', ratio: 0, message: 'Fetching liked tracks…' })
    const { likedTracks, artistIds, artistWeights } = await fetchAllLikedTracks(
      accessToken,
      emitProgress
    )

    emitProgress({ stage: 'followed_artists', ratio: 0, message: 'Fetching followed artists…' })
    await fetchAllFollowedArtists(accessToken, artistIds, artistWeights, emitProgress)

    emitProgress({ stage: 'artist_details', ratio: 0, message: 'Resolving artist details…' })
    const { artists, genres } = await fetchArtistsInBatches(
      accessToken,
      artistIds,
      artistWeights,
      emitProgress
    )

    emitProgress({
      stage: 'artist_details',
      ratio: 1,
      message: 'Artist details fetched successfully.'
    })

    const payload: CachedSpotifyData = {
      artists,
      liked_tracks: likedTracks,
      genres
    }

    spotifyCache.set(accessToken, payload)
    sendComplete(payload, false)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Spotify data.'
    writeNDJSON({
      type: 'error',
      error: message
    })
    response.statusCode = 500
    response.end()
  }
})

const coerceBoolean = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    value = value[0]
  }

  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  }

  return Boolean(value)
}

const createProgressEmitter = (write: (payload: unknown) => void) => {
  const stageWeights: Record<ProgressStage, number> = {
    liked_tracks: 0.5,
    followed_artists: 0.2,
    artist_details: 0.3
  }
  const stageOrder: ProgressStage[] = ['liked_tracks', 'followed_artists', 'artist_details']

  return ({ stage, ratio, message }: ProgressUpdate) => {
    const weight = stageWeights[stage]
    const clampedRatio = Math.min(Math.max(ratio, 0), 1)
    const baseWeight = stageOrder
      .slice(0, stageOrder.indexOf(stage))
      .reduce((sum, key) => sum + stageWeights[key], 0)
    const weightedProgress = baseWeight + clampedRatio * weight

    write({
      type: 'progress',
      stage,
      progress: Math.min(Math.round(weightedProgress * 100), 99),
      message
    })
  }
}

// Liked tracks fade in influence over ~2 months but never drop below a small weight.
const computeRecencyWeight = (addedAt?: string) => {
  if (!addedAt) {
    return LIKE_MIN_WEIGHT
  }

  const timestamp = new Date(addedAt).getTime()

  if (Number.isNaN(timestamp)) {
    return LIKE_MIN_WEIGHT
  }

  const diffMs = Date.now() - timestamp
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  const decayFactor = Math.exp(-Math.max(diffDays, 0) / LIKE_WEIGHT_DECAY_DAYS)

  return Math.max(LIKE_MIN_WEIGHT, decayFactor)
}

const fetchAllLikedTracks = async (
  accessToken: string,
  emitProgress: (update: ProgressUpdate) => void
) => {
  const likedTracks: LikedTrack[] = []
  const artistIds = new Set<string>()
  const artistWeights = new Map<string, number>()
  let nextUrl: string | null = `${SPOTIFY_API_BASE}/me/tracks?limit=50`
  let processed = 0
  let total = 0
  let pageSize = 50

  while (nextUrl) {
    const response: SpotifySavedTracksResponse = await fetchFromSpotify<SpotifySavedTracksResponse>(
      nextUrl,
      accessToken
    )
    const items: SpotifySavedTrack[] = response.items ?? []
    total = response.total ?? total
    pageSize = response.limit ?? pageSize

    items.forEach((item) => {
      if (!item.track || !item.track.id) {
        return
      }

      const weight = computeRecencyWeight(item.added_at)

      likedTracks.push({
        id: item.track.id,
        name: item.track.name,
        external_ids: item.track.external_ids,
        added_at: item.added_at
      })

      item.track.artists?.forEach((artist) => {
        if (artist.id) {
          artistIds.add(artist.id)
          // Newer likes boost artist weight, contributing more to their genres.
          artistWeights.set(artist.id, (artistWeights.get(artist.id) ?? 0) + weight)
        }
      })
    })

    processed += items.length
    nextUrl = response.next

    const ratio = total > 0 ? Math.min(processed / total, 0.99) : processed > 0 ? 0.5 : 0.25

    emitProgress({
      stage: 'liked_tracks',
      ratio,
      message: `Fetched ${processed} liked tracks`
    })
  }

  emitProgress({
    stage: 'liked_tracks',
    ratio: 1,
    message: `Fetched ${processed} liked tracks`
  })

  return { likedTracks, artistIds, artistWeights }
}

const fetchAllFollowedArtists = async (
  accessToken: string,
  artistIds: Set<string>,
  artistWeights: Map<string, number>,
  emitProgress: (update: ProgressUpdate) => void
) => {
  let nextUrl: string | null = `${SPOTIFY_API_BASE}/me/following?type=artist&limit=50`
  let processed = 0
  let total = 0

  while (nextUrl) {
    const response: SpotifyFollowedArtistsResponse = await fetchFromSpotify<
      SpotifyFollowedArtistsResponse
    >(nextUrl, accessToken)
    const items = response.artists.items ?? []
    total = response.artists.total ?? total

    items.forEach((artist) => {
      if (artist.id) {
        artistIds.add(artist.id)
        // Following an artist gives a steady bias even if you haven't liked them recently.
        artistWeights.set(artist.id, (artistWeights.get(artist.id) ?? 0) + FOLLOW_WEIGHT)
      }
    })

    processed += items.length
    nextUrl = response.artists.next

    const ratio = total > 0 ? Math.min(processed / total, 0.99) : processed > 0 ? 0.5 : 0.25

    emitProgress({
      stage: 'followed_artists',
      ratio,
      message: `Fetched ${processed} followed artists`
    })
  }

  emitProgress({
    stage: 'followed_artists',
    ratio: 1,
    message: `Fetched ${processed} followed artists`
  })
}

const fetchArtistsInBatches = async (
  accessToken: string,
  artistIds: Set<string>,
  artistWeights: Map<string, number>,
  emitProgress: (update: ProgressUpdate) => void
) => {
  const ids = Array.from(artistIds).filter(Boolean)
  const artists: NormalizedArtist[] = []
  const genreWeights = new Map<string, number>()
  let processed = 0
  let totalWeight = 0

  if (ids.length === 0) {
    return {
      artists,
      genres: []
    }
  }

  for (let index = 0; index < ids.length; index += MAX_ARTIST_BATCH) {
    const chunk = ids.slice(index, index + MAX_ARTIST_BATCH)

    if (chunk.length === 0) {
      continue
    }

    const url = `${SPOTIFY_API_BASE}/artists?ids=${chunk.join(',')}`
    const response: SpotifyArtistsBatchResponse = await fetchFromSpotify<SpotifyArtistsBatchResponse>(
      url,
      accessToken
    )

    response.artists.forEach((artist) => {
      const weight = artistWeights.get(artist.id) ?? 1
      totalWeight += weight

      artists.push({
        id: artist.id,
        name: artist.name,
        genres: artist.genres ?? []
      })

      // Aggregate weighted genre counts so recent likes and follows dominate.
      artist.genres?.forEach((genre) => {
        genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight)
      })
    })

    processed += chunk.length

    emitProgress({
      stage: 'artist_details',
      ratio: Math.min(processed / ids.length, 1),
      message: `Resolved ${processed} of ${ids.length} artists`
    })
  }

  const weightDenominator = totalWeight || 1

  const genres: GenreScore[] = Array.from(genreWeights.entries())
    .map(([name, weight]) => ({
      name,
      score: weight / weightDenominator
    }))
    .sort((a, b) => b.score - a.score)

  return {
    artists,
    genres
  }
}

const fetchFromSpotify = async <T>(url: string, accessToken: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const errorMessage =
      (payload as { error?: { message?: string } } | null)?.error?.message ??
      `Spotify request failed with status ${response.status}`
    throw new Error(errorMessage)
  }

  return (await response.json()) as T
}
