import { saveMusicFingerprintToIndexedDB, type MusicFingerprintPayload } from '~/utils/indexedDb'
import type { Recommendation } from '~/types/recommendation'

// Constants
const LIKE_WEIGHT_DECAY_DAYS = 60
const LIKE_MIN_WEIGHT = 0.1
const FOLLOW_WEIGHT = 0.5
const MAX_ARTIST_BATCH = 50
const QUICK_RECS_TRACKS_PER_ARTIST = 15

type ProgressStage = 'liked_tracks' | 'followed_artists' | 'top_artists' | 'artist_details' | 'quick_recommendations'

interface LikedTrack {
  id: string
  name: string
  artists: Array<{
    id?: string
    name: string
  }>
  album?: {
    id: string
    name: string
    release_date: string
  }
  added_at?: string
}

interface GenreScore {
  name: string
  score: number
}

interface FingerprintData {
  artists: string[]        // Encoded format
  liked_tracks: string[]   // Encoded format
  genres: GenreScore[]
}

interface SpotifyProfile {
  displayName: string
  email: string
  country: string
  profileImage: string | null
}

// Global state (survives navigation, resets on page reload)
const isLoading = ref(false)
const progressStage = ref<ProgressStage | null>(null)
const progressPercent = ref<number | null>(null)
const progressMessage = ref<string | null>(null)
const errorMessage = ref<string | null>(null)
const result = ref<FingerprintData | null>(null)

// Quick recommendations pool (progressive)
const quickRecommendationPool = ref<Recommendation[]>([])
const quickRecsProgress = ref({ current: 0, total: 0, artist: '' })

export const useFingerprintGenerator = () => {
  const auth = useSpotifyAuth()

  const emitProgress = (stage: ProgressStage, ratio: number, message: string) => {
    const stageWeights: Record<ProgressStage, number> = {
      liked_tracks: 0.4,
      followed_artists: 0.15,
      top_artists: 0.15,
      artist_details: 0.3
    }

    const stageOrder: ProgressStage[] = ['liked_tracks', 'followed_artists', 'top_artists', 'artist_details']

    const weight = stageWeights[stage]
    const clampedRatio = Math.min(Math.max(ratio, 0), 1)
    const baseWeight = stageOrder
      .slice(0, stageOrder.indexOf(stage))
      .reduce((sum, key) => sum + stageWeights[key], 0)
    const weightedProgress = baseWeight + clampedRatio * weight

    progressStage.value = stage
    progressPercent.value = Math.min(Math.round(weightedProgress * 100), 99)
    progressMessage.value = message
  }

  const computeRecencyWeight = (addedAt?: string): number => {
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

  const fetchAllLikedTracks = async (authHeader: string) => {
    const likedTracks: string[] = []
    const artistIds = new Set<string>()
    const artistWeights = new Map<string, number>()

    emitProgress('liked_tracks', 0, 'Fetching liked tracks…')

    let offset = 0
    let total = 0
    const limit = 50

    while (true) {
      const response = await $fetch<{
        items: Array<{
          track: {
            id: string
            name: string
            artists?: Array<{ id?: string; name: string }>
            album?: { id: string; name: string; release_date: string }
          } | null
          added_at?: string
        }>
        next: string | null
        total?: number
      }>('/api/spotify/liked-tracks', {
        headers: { Authorization: authHeader },
        query: { offset, limit }
      })

      total = response.total ?? total

      for (const item of response.items) {
        if (!item.track || !item.track.id) {
          continue
        }

        const weight = computeRecencyWeight(item.added_at)
        const firstArtist = item.track.artists?.[0]?.name

        if (firstArtist && item.track.name) {
          // Encode track to string format
          const encodedTrack = encodeTrack(firstArtist, item.track.name, item.added_at)
          likedTracks.push(encodedTrack)
        }

        item.track.artists?.forEach((artist) => {
          if (artist.id) {
            artistIds.add(artist.id)
            artistWeights.set(artist.id, (artistWeights.get(artist.id) ?? 0) + weight)
          }
        })
      }

      offset += response.items.length

      const ratio = total > 0 ? Math.min(offset / total, 0.99) : offset > 0 ? 0.5 : 0.25
      emitProgress('liked_tracks', ratio, `Fetched ${offset} liked tracks`)

      if (!response.next) {
        break
      }
    }

    emitProgress('liked_tracks', 1, `Fetched ${offset} liked tracks`)

    return { likedTracks, artistIds, artistWeights }
  }

  const fetchAllFollowedArtists = async (
    authHeader: string,
    artistIds: Set<string>,
    artistWeights: Map<string, number>
  ) => {
    emitProgress('followed_artists', 0, 'Fetching followed artists…')

    let after: string | null = null
    let processed = 0
    let total = 0

    while (true) {
      const response = await $fetch<{
        items: Array<{ id: string; name: string }>
        next: string | null
        total?: number
        after?: string | null
      }>('/api/spotify/followed-artists', {
        headers: { Authorization: authHeader },
        query: after ? { after } : {}
      })

      total = response.total ?? total

      for (const artist of response.items) {
        if (artist.id) {
          artistIds.add(artist.id)
          artistWeights.set(artist.id, (artistWeights.get(artist.id) ?? 0) + FOLLOW_WEIGHT)
        }
      }

      processed += response.items.length

      const ratio = total > 0 ? Math.min(processed / total, 0.99) : processed > 0 ? 0.5 : 0.25
      emitProgress('followed_artists', ratio, `Fetched ${processed} followed artists`)

      if (!response.next) {
        break
      }

      after = response.after ?? null
    }

    emitProgress('followed_artists', 1, `Fetched ${processed} followed artists`)
  }

  const fetchTopArtists = async (authHeader: string): Promise<Set<string>> => {
    emitProgress('top_artists', 0, 'Fetching top artists…')

    try {
      const response = await $fetch<{
        items: Array<{ id: string; name: string }>
        total?: number
      }>('/api/spotify/top-artists', {
        headers: { Authorization: authHeader },
        query: { limit: 20, time_range: 'medium_term' }
      })

      const topArtistIds = new Set<string>()
      for (const artist of response.items) {
        if (artist.id) {
          topArtistIds.add(artist.id)
        }
      }

      emitProgress('top_artists', 1, `Fetched ${topArtistIds.size} top artists`)
      return topArtistIds
    } catch (error) {
      console.error('Failed to fetch top artists:', error)
      emitProgress('top_artists', 1, 'Top artists unavailable')
      return new Set<string>()
    }
  }

  const fetchArtistsInBatches = async (
    authHeader: string,
    artistIds: Set<string>,
    artistWeights: Map<string, number>,
    topArtistIds: Set<string>
  ) => {
    emitProgress('artist_details', 0, 'Resolving artist details…')

    const ids = Array.from(artistIds).filter(Boolean)
    const artists: string[] = []
    const genreWeights = new Map<string, number>()
    let processed = 0
    let totalWeight = 0

    if (ids.length === 0) {
      return { artists, genres: [] }
    }

    for (let index = 0; index < ids.length; index += MAX_ARTIST_BATCH) {
      const chunk = ids.slice(index, index + MAX_ARTIST_BATCH)

      if (chunk.length === 0) {
        continue
      }

      const response = await $fetch<{
        artists: Array<{
          id: string
          name: string
          genres: string[]
        }>
      }>('/api/spotify/artists-batch', {
        headers: { Authorization: authHeader },
        query: { ids: chunk.join(',') }
      })

      for (const artist of response.artists) {
        const weight = artistWeights.get(artist.id) ?? 1
        totalWeight += weight

        const isTopArtist = topArtistIds.has(artist.id)

        // Encode artist to string format
        const encodedArtist = encodeArtist(artist.name, artist.genres ?? [], isTopArtist)
        artists.push(encodedArtist)

        artist.genres?.forEach((genre) => {
          genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight)
        })
      }

      processed += chunk.length

      emitProgress('artist_details', Math.min(processed / ids.length, 1), `Resolved ${processed} of ${ids.length} artists`)
    }

    const weightDenominator = totalWeight || 1

    const genres: GenreScore[] = Array.from(genreWeights.entries())
      .map(([name, weight]) => ({
        name,
        score: weight / weightDenominator
      }))
      .sort((a, b) => b.score - a.score)

    emitProgress('artist_details', 1, 'Artist details fetched successfully.')

    return { artists, genres }
  }

  const buildQuickRecommendationPool = async (authHeader: string) => {
    // Reset pool
    quickRecommendationPool.value = []
    quickRecsProgress.value = { current: 0, total: 20, artist: '' }

    progressStage.value = 'quick_recommendations'
    progressMessage.value = 'Building quick recommendations from your top artists...'

    try {
      // Fetch top 20 artists
      const topArtistsResponse = await $fetch<{
        items: Array<{ id: string; name: string }>
      }>('/api/spotify/top-artists', {
        headers: { Authorization: authHeader },
        query: { limit: 20, time_range: 'medium_term' }
      })

      const topArtists = topArtistsResponse.items
      quickRecsProgress.value.total = topArtists.length

      console.log(`🎵 Starting quick recommendation pool with ${topArtists.length} top artists`)

      // Process each artist sequentially
      for (const [index, spotifyArtist] of topArtists.entries()) {
        quickRecsProgress.value.current = index + 1
        quickRecsProgress.value.artist = spotifyArtist.name
        progressMessage.value = `Processing: ${spotifyArtist.name} (${index + 1}/${topArtists.length})`

        try {
          // Search MusicBrainz for artist MBID
          const searchResponse = await $fetch<{
            artists: Array<{ id: string; name: string; score?: number }>
          }>('/api/musicbrainz/search-artist', {
            query: { name: spotifyArtist.name, limit: 1 }
          })

          if (!searchResponse.artists || searchResponse.artists.length === 0) {
            console.warn(`⚠️ No MusicBrainz match for ${spotifyArtist.name}`)
            continue
          }

          const mbArtist = searchResponse.artists[0]
          console.log(`✓ Found MBID for ${spotifyArtist.name}: ${mbArtist.id}`)

          // Fetch recordings for this artist
          console.log(`  Fetching recordings from /api/musicbrainz/artist-recordings with MBID: ${mbArtist.id}`)

          const recordingsResponse = await $fetch<{
            recordings: Array<{
              id: string
              title: string
              'artist-credit'?: Array<{ name?: string }>
              isrcs?: string[]
            }>
          }>('/api/musicbrainz/artist-recordings', {
            query: { mbid: mbArtist.id, limit: QUICK_RECS_TRACKS_PER_ARTIST }
          })

          console.log(`  Received response:`, recordingsResponse)

          const recordings = recordingsResponse.recordings || []
          console.log(`  Recordings array length: ${recordings.length}`)

          // Add to pool
          const newRecommendations: Recommendation[] = []
          for (const recording of recordings) {
            const artist = recording['artist-credit']?.[0]?.name || spotifyArtist.name
            const title = recording.title

            const recommendation: Recommendation = {
              title,
              artist,
              mrid: generateMRID(artist, title)
            }

            quickRecommendationPool.value.push(recommendation)
            newRecommendations.push(recommendation)
          }

          // Log pool update with plain objects (not Vue proxies)
          console.log(`📊 Quick Rec Pool Updated (${quickRecommendationPool.value.length} tracks):`)
          console.log(`  Artist: ${spotifyArtist.name}`)
          console.log(`  Added: ${recordings.length} tracks`)
          console.log(`  Pool size: ${quickRecommendationPool.value.length}`)
          console.log(`  Pool:`, JSON.parse(JSON.stringify(quickRecommendationPool.value)))
        } catch (error) {
          console.error(`Error processing ${spotifyArtist.name}:`, error)
        }
      }

      console.log(`✅ Quick recommendation pool complete: ${quickRecommendationPool.value.length} total tracks`)
    } catch (error) {
      console.error('Failed to build quick recommendation pool:', error)
    }
  }

  const generateFingerprint = async (force = false) => {
    if (isLoading.value) {
      return
    }

    const authHeader = await auth.getAuthorizationHeader()

    if (!authHeader) {
      errorMessage.value = 'Missing Spotify access token. Please log in again.'
      return
    }

    isLoading.value = true
    errorMessage.value = null
    progressStage.value = null
    progressPercent.value = null
    progressMessage.value = null
    result.value = null

    try {
      // Fetch profile for user info
      const profile = await $fetch<SpotifyProfile>('/api/spotify-profile', {
        headers: { Authorization: authHeader }
      })

      // Step 0: Build quick recommendation pool FIRST (progressive)
      await buildQuickRecommendationPool(authHeader)

      // Step 1: Fetch all liked tracks
      const { likedTracks, artistIds, artistWeights } = await fetchAllLikedTracks(authHeader)

      // Step 2: Fetch all followed artists
      await fetchAllFollowedArtists(authHeader, artistIds, artistWeights)

      // Step 3: Fetch top artists
      const topArtistIds = await fetchTopArtists(authHeader)

      // Step 4: Fetch artist details in batches
      const { artists, genres } = await fetchArtistsInBatches(
        authHeader,
        artistIds,
        artistWeights,
        topArtistIds
      )

      // Build result
      const fingerprintData: FingerprintData = {
        artists,
        liked_tracks: likedTracks,
        genres
      }

      result.value = fingerprintData

      // Save to IndexedDB
      if (process.client) {
        const fingerprint: MusicFingerprintPayload = {
          version: 1,
          generated_at: new Date().toISOString(),
          user: {
            displayName: profile.displayName,
            email: profile.email,
            country: profile.country,
            profileImage: profile.profileImage
          },
          taste: {
            artists,
            liked_tracks: likedTracks,
            genres
          },
          seen_recommendations: []
        }

        await saveMusicFingerprintToIndexedDB(fingerprint)
      }

      progressStage.value = 'artist_details'
      progressPercent.value = 100
      progressMessage.value = 'Completed'
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to generate fingerprint.'
      errorMessage.value = message
      console.error('Fingerprint generation error:', error)
    } finally {
      isLoading.value = false
    }
  }

  const rebuildQuickRecommendations = async () => {
    const authHeader = await auth.getAuthorizationHeader()

    if (!authHeader) {
      errorMessage.value = 'Missing Spotify access token. Please log in again.'
      return
    }

    await buildQuickRecommendationPool(authHeader)
  }

  return {
    // State
    isLoading: readonly(isLoading),
    progressStage: readonly(progressStage),
    progressPercent: readonly(progressPercent),
    progressMessage: readonly(progressMessage),
    errorMessage: readonly(errorMessage),
    result: readonly(result),

    // Quick recommendations (not readonly so we can mutate from page)
    quickRecommendationPool,
    quickRecsProgress: readonly(quickRecsProgress),

    // Actions
    generateFingerprint,
    rebuildQuickRecommendations
  }
}
