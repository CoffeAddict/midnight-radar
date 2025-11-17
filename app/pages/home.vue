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
        </div>
        <Alert v-if="progressMessage">
          <AlertDescription>
            {{ progressMessage }}
            <span v-if="progressPercent !== null">({{ progressPercent }}%)</span>
          </AlertDescription>
        </Alert>
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
          <Button
            type="button"
            :disabled="!existingFingerprint || recommendationsLoading"
            @click="fetchRecommendationsList"
          >
            {{ recommendationsLoading ? 'Generating recommendations…' : 'Get recommendations' }}
          </Button>
          <Alert v-if="recommendationsError" variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{{ recommendationsError }}</AlertDescription>
          </Alert>
          <Card v-if="recommendations.length">
            <CardContent class="pt-6 space-y-3">
              <div class="space-y-2">
                <div class="relative w-full overflow-hidden rounded-lg bg-muted" style="padding-bottom: 56.25%;">
                  <iframe
                    v-if="youtubeVideo"
                    class="absolute left-0 top-0 h-full w-full"
                    :src="`${youtubeVideo.url}?rel=0`"
                    title="YouTube video player"
                    frameborder="0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen
                  />
                  <div
                    v-else-if="youtubeLoading"
                    class="absolute inset-0 flex items-center justify-center"
                  >
                    Loading video…
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
                    Select a recommendation to view.
                  </div>
                </div>
                <div v-if="currentRecommendation" class="space-y-1">
                  <h2 class="text-xl font-semibold">
                    {{ currentRecommendation.title }} ({{ currentRecommendation.genre }})
                  </h2>
                  <p class="text-muted-foreground">{{ currentRecommendation.artist }}</p>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  :disabled="recommendationsLoading || youtubeLoading || !recommendations.length"
                  @click="showPreviousRecommendation"
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  :disabled="recommendationsLoading || youtubeLoading || !recommendations.length"
                  @click="showNextRecommendation"
                >
                  Next
                </Button>
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
  type MusicFingerprintPayload
} from '~/utils/indexedDb'
import { useRecommendationEngine, type Recommendation } from '~/composables/useRecommendationEngine'

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
  generateFingerprint
} = fingerprint

const profile = ref<SpotifyProfile | null>(null)
const existingFingerprint = ref<MusicFingerprintPayload | null>(null)
const recommendations = ref<Recommendation[]>([])
const recommendationsLoading = ref(false)
const recommendationsError = ref<string | null>(null)
const currentRecommendationIndex = ref(0)
const currentRecommendation = computed(() =>
  recommendations.value[currentRecommendationIndex.value] ?? null
)

interface YouTubeVideoMeta {
  videoId: string
  url: string
  title: string
  thumbnail: string
}

const youtubeVideo = ref<YouTubeVideoMeta | null>(null)
const youtubeLoading = ref(false)
const youtubeError = ref<string | null>(null)

const formattedResult = computed(() =>
  result.value ? JSON.stringify(result.value, null, 2) : ''
)
const topGenres = computed(() => (result.value ? result.value.genres.slice(0, 5) : []))
const recommendationEngine = useRecommendationEngine()

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

  recommendationsLoading.value = true
  recommendationsError.value = null
  youtubeError.value = null
  youtubeVideo.value = null
  currentRecommendationIndex.value = 0

  try {
    let fingerprint = existingFingerprint.value

    if (!fingerprint) {
      fingerprint = await getMusicFingerprintFromIndexedDB().catch(() => null)
    }

    if (!fingerprint) {
      throw new Error('No fingerprint available yet. Please generate Spotify data first.')
    }

    const recs = await recommendationEngine.generateRecommendations({ fingerprint })
    recommendations.value = recs
    console.log('Recommendations', recs)

    currentRecommendationIndex.value = 0
    await loadYouTubeVideoForCurrentRecommendation()
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to generate recommendations.'
    recommendationsError.value = message
    console.error(message, error)
    youtubeVideo.value = null
  } finally {
    recommendationsLoading.value = false
  }
}

const loadYouTubeVideoForCurrentRecommendation = async () => {
  if (!process.client) {
    youtubeVideo.value = null
    return
  }

  const recommendation = currentRecommendation.value

  if (!recommendation) {
    youtubeVideo.value = null
    youtubeError.value = null
    youtubeLoading.value = false
    return
  }

  youtubeLoading.value = true
  youtubeError.value = null

  try {
    const video = await $fetch<YouTubeVideoMeta>('/api/youtube-search', {
      query: {
        song: recommendation.title,
        artist: recommendation.artist
      }
    })

    youtubeVideo.value = video
  } catch (error: unknown) {
    youtubeVideo.value = null
    youtubeError.value =
      error instanceof Error ? error.message : 'Failed to load video for this track.'
  } finally {
    youtubeLoading.value = false
  }
}

const showNextRecommendation = async () => {
  const total = recommendations.value.length
  if (!total) {
    return
  }

  currentRecommendationIndex.value = (currentRecommendationIndex.value + 1) % total
  await loadYouTubeVideoForCurrentRecommendation()
}

const showPreviousRecommendation = async () => {
  const total = recommendations.value.length
  if (!total) {
    return
  }

  currentRecommendationIndex.value =
    (currentRecommendationIndex.value - 1 + total) % total
  await loadYouTubeVideoForCurrentRecommendation()
}

onMounted(() => {
  loadProfileAndFingerprint()
})
</script>
