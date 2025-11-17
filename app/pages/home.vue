<template>
  <main class="min-h-screen px-6 py-12">
    <div class="mx-auto flex max-w-3xl flex-col gap-10">
      <header>
        <h1 class="text-4xl font-semibold">Midnight Radar</h1>
        <p class="text-sm text-muted-foreground">Your personalized Spotify insights.</p>
      </header>

      <section class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Button
            type="button"
            :disabled="isLoading"
            @click="fetchSpotifyData()"
          >
            {{ isLoading ? 'Fetching data…' : 'Fetch Spotify data' }}
          </Button>
          <Button
            type="button"
            variant="outline"
            :disabled="isLoading"
            @click="fetchSpotifyData(true)"
          >
            {{ isLoading ? 'Refreshing…' : 'Force refresh' }}
          </Button>
          <Button
            type="button"
            variant="secondary"
            :disabled="isLoading || progressStage === 'quick_recommendations'"
            @click="rebuildQuickRecommendations()"
          >
            {{ progressStage === 'quick_recommendations' ? 'Building…' : 'Rebuild Quick Recs' }}
          </Button>
          <Button
            type="button"
            variant="outline"
            @click="handleClearCache()"
          >
            Clear Cache
          </Button>
        </div>
        <Alert v-if="progressMessage">
          <AlertDescription>
            {{ progressMessage }}
            <span v-if="progressPercent !== null">({{ progressPercent }}%)</span>
          </AlertDescription>
        </Alert>

        <!-- Quick Recommendation Pool Progress -->
        <Card v-if="quickRecsProgress.total > 0 && isLoading" class="border-primary">
          <CardContent class="pt-6">
            <div class="space-y-3">
              <div class="flex items-center justify-between text-sm">
                <span class="font-medium">Quick Recommendations Pool</span>
                <span class="text-muted-foreground">
                  {{ quickRecsProgress.current }}/{{ quickRecsProgress.total }} artists
                </span>
              </div>
              <div v-if="quickRecsProgress.artist" class="text-sm text-muted-foreground">
                Processing: <span class="font-medium text-foreground">{{ quickRecsProgress.artist }}</span>
              </div>
              <div class="text-sm">
                <span class="font-semibold text-primary">{{ quickRecommendationPool.length }} tracks</span>
                <span class="text-muted-foreground"> in pool</span>
              </div>
              <div class="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  class="h-full bg-primary transition-all duration-300"
                  :style="{ width: `${(quickRecsProgress.current / quickRecsProgress.total) * 100}%` }"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Alert v-if="errorMessage" variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{{ errorMessage }}</AlertDescription>
        </Alert>
        <Card v-if="result">
          <CardContent class="pt-6 text-sm">
            <p class="mb-2 text-muted-foreground">
              Retrieved {{ result.artists.length }} artists, {{ result.liked_tracks.length }} liked tracks, and
              {{ result.genres.length }} genres.
            </p>
            <ul v-if="topGenres.length" class="mb-3 space-y-1">
              <li v-for="genre in topGenres" :key="genre.name">
                {{ genre.name }} · {{ genre.score.toFixed(2) }}
              </li>
            </ul>
            <details>
              <summary class="cursor-pointer">View raw data</summary>
              <pre class="mt-4 overflow-x-auto whitespace-pre-wrap text-left text-xs bg-muted p-3 rounded">
{{ formattedResult }}
              </pre>
            </details>
            <div v-if="existingFingerprint" class="mt-3 flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                @click="downloadFingerprintJson"
              >
                Download Fingerprint JSON
              </Button>
              <span class="text-xs text-muted-foreground">
                ({{ fingerprintJsonSize }})
              </span>
            </div>
          </CardContent>
        </Card>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <Button
              type="button"
              :disabled="quickRecommendationPool.length === 0 || recommendationsLoading"
              @click="fetchRecommendationsList"
            >
              {{ recommendationsLoading ? 'Finding recommendation…' : 'Get Next Recommendation' }}
            </Button>
            <span v-if="quickRecommendationPool.length > 0" class="text-sm text-muted-foreground">
              Pool: {{ quickRecommendationPool.length }} tracks
            </span>
          </div>
          <Alert v-if="recommendationsError" variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{{ recommendationsError }}</AlertDescription>
          </Alert>
          <Card v-if="currentRecommendation">
            <CardContent class="pt-6 space-y-3">
              <div class="space-y-2">
                <div class="relative w-full overflow-hidden rounded-lg bg-muted" style="padding-bottom: 56.25%;">
                  <!-- YouTube Player API container -->
                  <div
                    v-if="youtubeVideo"
                    :id="PLAYER_ELEMENT_ID"
                    class="absolute left-0 top-0 h-full w-full"
                  />
                  <div
                    v-else-if="youtubeLoading"
                    class="absolute inset-0 flex items-center justify-center"
                  >
                    Loading video…
                  </div>
                  <div
                    v-else-if="ytPlayer.hasError.value"
                    class="absolute inset-0 flex items-center justify-center text-destructive text-sm text-center px-4"
                  >
                    Video cannot be embedded (auto-skipping...)
                  </div>
                  <div
                    v-else-if="youtubeError"
                    class="absolute inset-0 flex items-center justify-center text-destructive text-sm text-center px-4"
                  >
                    {{ youtubeError }}
                  </div>
                  <div
                    v-else
                    class="absolute inset-0 flex items-center justify-center text-muted-foreground"
                  >
                    Click "Get Next Recommendation" to start.
                  </div>
                </div>
                <div class="space-y-3">
                  <div class="space-y-1">
                    <h2 class="text-xl font-semibold">
                      {{ currentRecommendation.title }}
                    </h2>
                    <p class="text-muted-foreground">{{ currentRecommendation.artist }}</p>
                  </div>
                  <div class="flex items-center gap-2">
                    <a
                      :href="getSpotifySearchUrl(currentRecommendation.artist, currentRecommendation.title)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md p-1.5 transition-opacity hover:opacity-80"
                      style="background-color: #1DB954;"
                      title="Search on Spotify"
                    >
                      <img src="/icons/spotify.svg" alt="Spotify" class="h-full w-full" />
                    </a>
                    <a
                      :href="getSoundCloudSearchUrl(currentRecommendation.artist, currentRecommendation.title)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md p-1.5 transition-opacity hover:opacity-80"
                      style="background-color: #FF5500;"
                      title="Search on SoundCloud"
                    >
                      <img src="/icons/soundcloud.svg" alt="SoundCloud" class="h-full w-full" />
                    </a>
                    <a
                      :href="getAppleMusicSearchUrl(currentRecommendation.artist, currentRecommendation.title)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md p-1.5 transition-opacity hover:opacity-80"
                      style="background-color: #FA243C;"
                      title="Search on Apple Music"
                    >
                      <img src="/icons/apple_music.svg" alt="Apple Music" class="h-full w-full" />
                    </a>
                    <a
                      :href="getYouTubeMusicSearchUrl(currentRecommendation.artist, currentRecommendation.title)"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex h-9 w-9 items-center justify-center rounded-md overflow-hidden transition-opacity hover:opacity-80"
                      title="Search on YouTube Music"
                    >
                      <img src="/icons/youtube_music.jpeg" alt="YouTube Music" class="h-full w-full object-cover" />
                    </a>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  getMusicFingerprintFromIndexedDB,
  getRecommendationsCacheFromIndexedDB,
  addDisplayedRecommendation,
  addNoVideoRecommendation,
  isRecommendationCached,
  clearRecommendationsCache,
  type MusicFingerprintPayload
} from '~/utils/indexedDb'
import type { Recommendation } from '~/types/recommendation'

definePageMeta({
  middleware: 'auth'
})

const auth = useSpotifyAuth()
const router = useRouter()

// Use global fingerprint generator
const fingerprint = useFingerprintGenerator()
const {
  isLoading,
  progressStage,
  progressPercent,
  progressMessage,
  errorMessage,
  result,
  quickRecommendationPool,
  quickRecsProgress,
  generateFingerprint,
  rebuildQuickRecommendations
} = fingerprint

const profile = ref<SpotifyProfile | null>(null)
const existingFingerprint = ref<MusicFingerprintPayload | null>(null)
const recommendationsLoading = ref(false)
const recommendationsError = ref<string | null>(null)
const currentRecommendation = ref<Recommendation | null>(null)

interface YouTubeVideoMeta {
  videoId: string
  url: string
  title: string
  thumbnail: string
}

const youtubeVideo = ref<YouTubeVideoMeta | null>(null)
const youtubeLoading = ref(false)
const youtubeError = ref<string | null>(null)

// YouTube Player API
const ytPlayer = useYouTubePlayer()
const PLAYER_ELEMENT_ID = 'youtube-player'

const formattedResult = computed(() =>
  result.value ? JSON.stringify(result.value, null, 2) : ''
)
const topGenres = computed(() => (result.value ? result.value.genres.slice(0, 5) : []))

// Fingerprint JSON download
const fingerprintJsonSize = computed(() => {
  if (!existingFingerprint.value) return ''
  const jsonString = JSON.stringify(existingFingerprint.value)
  const bytes = new Blob([jsonString]).size
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
})

const downloadFingerprintJson = () => {
  if (!existingFingerprint.value) return

  try {
    const jsonString = JSON.stringify(existingFingerprint.value, null, 2)
    const blob = new Blob([jsonString], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `midnight-radar-fingerprint-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Failed to download fingerprint JSON', error)
  }
}

interface SpotifyProfile {
  displayName: string
  email: string
  country: string
  profileImage: string | null
}

const loadProfileAndFingerprint = async () => {
  try {
    const authorizationHeader = await auth.getAuthorizationHeader()

    if (!authorizationHeader) {
      throw new Error('Missing Spotify access token. Please log in again.')
    }

    const profileResponse = await $fetch<SpotifyProfile>('/api/spotify-profile', {
      headers: {
        Authorization: authorizationHeader
      }
    })

    profile.value = profileResponse

    if (process.client) {
      const stored = await getMusicFingerprintFromIndexedDB().catch(() => null)
      existingFingerprint.value = stored

      if (stored && stored.user.email === profileResponse.email) {
        // Already have fingerprint, don't auto-generate
        return
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load profile.'
    console.error(message, error)
  }
}

const fetchSpotifyData = async (force = false) => {
  await generateFingerprint(force)

  // Update existingFingerprint after generation
  if (process.client && result.value) {
    const stored = await getMusicFingerprintFromIndexedDB().catch(() => null)
    existingFingerprint.value = stored
  }
}

const fetchRecommendationsList = async () => {
  if (recommendationsLoading.value) {
    return
  }

  // Destroy existing player
  ytPlayer.destroyPlayer()

  recommendationsLoading.value = true
  recommendationsError.value = null
  youtubeError.value = null
  youtubeVideo.value = null

  try {
    // Check if quick recommendation pool has tracks
    if (quickRecommendationPool.value.length === 0) {
      throw new Error('No recommendations in pool. Please generate Spotify data first or rebuild quick recs.')
    }

    // Load recommendations cache
    const cache = await getRecommendationsCacheFromIndexedDB()

    // Loop until we find a valid recommendation
    let attempts = 0
    const MAX_ATTEMPTS = 50

    while (attempts < MAX_ATTEMPTS) {
      if (quickRecommendationPool.value.length === 0) {
        throw new Error('Pool exhausted. Please rebuild quick recommendations.')
      }

      // Get random recommendation from pool
      const randomIndex = Math.floor(Math.random() * quickRecommendationPool.value.length)
      const recommendation = quickRecommendationPool.value[randomIndex]

      // Check if already displayed OR has no video
      if (isRecommendationCached(recommendation.mrid, cache)) {
        // Skip this one, remove from pool
        quickRecommendationPool.value.splice(randomIndex, 1)
        attempts++
        continue
      }

      // Try to find on YouTube
      try {
        youtubeLoading.value = true
        const video = await $fetch<YouTubeVideoMeta>('/api/youtube-search', {
          query: {
            song: recommendation.title,
            artist: recommendation.artist
          }
        })

        // SUCCESS: Video found
        currentRecommendation.value = recommendation
        youtubeVideo.value = video
        youtubeError.value = null

        // Create YouTube player with error handler
        await createYouTubePlayer(video.videoId, async (errorCode: number) => {
          console.error(`🚫 YouTube player error ${errorCode} for: ${recommendation.artist} - ${recommendation.title}`)
          // Mark as no_video and auto-skip
          await addNoVideoRecommendation(recommendation.mrid)
          // Auto-fetch next recommendation
          await fetchRecommendationsList()
        })

        // Mark as displayed in cache
        await addDisplayedRecommendation(recommendation.mrid)

        // Remove from pool
        quickRecommendationPool.value.splice(randomIndex, 1)

        console.log(`✅ Found video for: ${recommendation.artist} - ${recommendation.title}`)
        console.log(`📊 Pool remaining: ${quickRecommendationPool.value.length} tracks`)
        console.log('🎵 Displaying recommendation:', JSON.parse(JSON.stringify(recommendation)))
        break
      } catch (error) {
        // NO VIDEO: Mark as no_video and try next
        console.warn(`⚠️ No video found for: ${recommendation.artist} - ${recommendation.title}`)
        await addNoVideoRecommendation(recommendation.mrid)

        // Remove from pool
        quickRecommendationPool.value.splice(randomIndex, 1)
        attempts++
      } finally {
        youtubeLoading.value = false
      }
    }

    if (attempts >= MAX_ATTEMPTS) {
      throw new Error('Unable to find valid recommendations. Please rebuild quick recommendations.')
    }
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to get recommendation.'
    recommendationsError.value = message
    console.error(message, error)
    youtubeVideo.value = null
    currentRecommendation.value = null
  } finally {
    recommendationsLoading.value = false
  }
}

const handleClearCache = async () => {
  try {
    await clearRecommendationsCache()
    console.log('✅ Recommendations cache cleared')
    alert('Recommendations cache cleared! You can now see previously displayed tracks again.')
  } catch (error) {
    console.error('Failed to clear cache:', error)
    alert('Failed to clear cache. Please try again.')
  }
}

const createYouTubePlayer = async (
  videoId: string,
  onError: (errorCode: number) => void
) => {
  try {
    await ytPlayer.createPlayer(PLAYER_ELEMENT_ID, videoId, onError)
  } catch (error) {
    console.error('Failed to create YouTube player:', error)
    throw error
  }
}

// Streaming service search URL generators
const getSpotifySearchUrl = (artist: string, track: string): string => {
  const query = encodeURIComponent(`${artist} - ${track}`)
  return `https://open.spotify.com/search/${query}`
}

const getSoundCloudSearchUrl = (artist: string, track: string): string => {
  const query = encodeURIComponent(`${artist} - ${track}`)
  return `https://soundcloud.com/search?q=${query}`
}

const getAppleMusicSearchUrl = (artist: string, track: string): string => {
  const query = encodeURIComponent(`${artist} ${track}`)
  return `https://music.apple.com/us/search?term=${query}`
}

const getYouTubeMusicSearchUrl = (artist: string, track: string): string => {
  const query = encodeURIComponent(`${artist} ${track}`)
  return `https://music.youtube.com/search?q=${query}`
}

onMounted(() => {
  loadProfileAndFingerprint()
})
</script>
