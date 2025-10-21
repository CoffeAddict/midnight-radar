<template>
  <main class="min-h-screen bg-neutral-950 px-6 py-12 text-white">
    <div class="mx-auto flex max-w-3xl flex-col gap-10">
      <header class="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 class="text-4xl font-semibold">Midnight Radar</h1>
          <p class="text-sm text-neutral-400">Your personalized Spotify insights.</p>
        </div>
        <button
          type="button"
          class="rounded-full border border-neutral-500 px-4 py-2 text-sm font-medium transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200"
          @click="handleLogout"
        >
          Logout
        </button>
      </header>

      <section class="space-y-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <button
            type="button"
            class="rounded-full bg-emerald-500 px-6 py-2 text-sm font-medium text-neutral-900 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:pointer-events-none disabled:opacity-60"
            :disabled="isLoading"
            @click="fetchSpotifyData()"
          >
            {{ isLoading ? 'Fetching data…' : 'Fetch Spotify data' }}
          </button>
          <button
            type="button"
            class="rounded-full border border-neutral-600 px-6 py-2 text-sm font-medium transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200 disabled:pointer-events-none disabled:opacity-60"
            :disabled="isLoading"
            @click="fetchSpotifyData(true)"
          >
            {{ isLoading ? 'Refreshing…' : 'Force refresh' }}
          </button>
        </div>
        <p v-if="progressMessage" class="text-sm text-neutral-300">
          {{ progressMessage }}
          <span v-if="progressPercent !== null">({{ progressPercent }}%)</span>
        </p>
        <p v-if="errorMessage" class="text-sm text-rose-300">{{ errorMessage }}</p>
        <div v-if="result" class="rounded-lg border border-neutral-800 bg-neutral-900 p-4 text-sm">
          <p class="mb-2 text-neutral-400">
            Retrieved {{ result.artists.length }} artists, {{ result.liked_tracks.length }} liked tracks, and
            {{ result.genres.length }} genres.
          </p>
          <ul v-if="topGenres.length" class="mb-3 space-y-1 text-neutral-300">
            <li v-for="genre in topGenres" :key="genre.name">
              {{ genre.name }} · {{ genre.score.toFixed(2) }}
            </li>
          </ul>
          <details>
            <summary class="cursor-pointer text-neutral-300">View raw data</summary>
            <pre class="mt-4 overflow-x-auto whitespace-pre-wrap text-left text-neutral-200">
{{ formattedResult }}
            </pre>
          </details>
        </div>
        <div class="space-y-3">
          <button
            type="button"
            class="rounded-full bg-blue-500 px-6 py-2 text-sm font-medium text-neutral-900 transition hover:bg-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-200 disabled:pointer-events-none disabled:opacity-60"
            :disabled="!existingFingerprint || recommendationsLoading"
            @click="fetchRecommendationsList"
          >
            {{ recommendationsLoading ? 'Generating recommendations…' : 'Get recommendations' }}
          </button>
          <p v-if="recommendationsError" class="text-sm text-rose-300">
            {{ recommendationsError }}
          </p>
          <div v-if="recommendations.length" class="space-y-3">
            <div class="space-y-2">
              <div class="relative w-full overflow-hidden rounded-lg bg-neutral-900" style="padding-bottom: 56.25%;">
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
                  class="absolute inset-0 flex items-center justify-center text-neutral-300"
                >
                  Loading video…
                </div>
                <div
                  v-else-if="youtubeError"
                  class="absolute inset-0 flex items-center justify-center text-rose-300 text-sm text-center px-4"
                >
                  {{ youtubeError }}
                </div>
                <div
                  v-else
                  class="absolute inset-0 flex items-center justify-center text-neutral-400"
                >
                  Select a recommendation to view.
                </div>
              </div>
              <div v-if="currentRecommendation" class="space-y-1">
                <h2 class="text-xl font-semibold">
                  {{ currentRecommendation.title }} ({{ currentRecommendation.genre }})
                </h2>
                <p class="text-neutral-400">{{ currentRecommendation.artist }}</p>
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="rounded-full border border-neutral-600 px-4 py-2 text-sm font-medium transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200 disabled:pointer-events-none disabled:opacity-60"
                :disabled="recommendationsLoading || youtubeLoading || !recommendations.length"
                @click="showPreviousRecommendation"
              >
                Previous
              </button>
              <button
                type="button"
                class="rounded-full border border-neutral-600 px-4 py-2 text-sm font-medium transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-200 disabled:pointer-events-none disabled:opacity-60"
                :disabled="recommendationsLoading || youtubeLoading || !recommendations.length"
                @click="showNextRecommendation"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  getMusicFingerprintFromIndexedDB,
  saveMusicFingerprintToIndexedDB,
  type MusicFingerprintPayload
} from '~/utils/indexedDb'
import { useRecommendationEngine, type Recommendation } from '~/composables/useRecommendationEngine'

definePageMeta({
  middleware: 'auth'
})

const auth = useSpotifyAuth()
const router = useRouter()

const isLoading = ref(false)
const errorMessage = ref<string | null>(null)
const progressStage = ref<string | null>(null)
const progressPercent = ref<number | null>(null)
const progressMessage = ref<string | null>(null)
const result = ref<{
  artists: any[]
  liked_tracks: any[]
  genres: Array<{ name: string; score: number }>
} | null>(null)
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
        result.value = {
          artists: stored.taste.artists as any[],
          liked_tracks: stored.taste.liked_tracks as any[],
          genres: stored.taste.genres as Array<{ name: string; score: number }>
        }
        progressStage.value = 'cached'
        progressPercent.value = 100
        progressMessage.value = 'Loaded fingerprint from this device.'
        return
      }
    }

    await fetchSpotifyData()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to initialize fingerprint.'
    errorMessage.value = message
  }
}

const fetchSpotifyData = async (force = false) => {
  if (isLoading.value) {
    return
  }

  const authorizationHeader = await auth.getAuthorizationHeader()

  if (!authorizationHeader) {
    errorMessage.value = 'Missing Spotify access token. Please log in again.'
    auth.logout()
    router.push('/login')
    return
  }

  isLoading.value = true
  errorMessage.value = null
  progressStage.value = null
  progressPercent.value = null
  progressMessage.value = null
  result.value = null

  try {
    if (!process.client) {
      throw new Error('Spotify fetch requires a browser environment.')
    }

    const url = new URL('/api/fetch-spotify-user-data', window.location.origin)
    if (force) {
      url.searchParams.set('force', 'true')
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: authorizationHeader
      }
    })

    if (!response.body) {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`)
      }
      throw new Error('Streaming response is not supported in this environment.')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let done = false

    while (!done) {
      const { value, done: readerDone } = await reader.read()
      done = readerDone

      if (value) {
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (await processStreamLine(line)) {
            done = true
            break
          }
        }
      }
    }

    if (!done && buffer.trim()) {
      await processStreamLine(buffer)
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Spotify data.'
    errorMessage.value = message
  } finally {
    isLoading.value = false
  }
}

const handleLogout = () => {
  auth.logout()
  router.push('/login')
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

const cloneForStorage = <T>(value: T): T => {
  try {
    return JSON.parse(JSON.stringify(value)) as T
  } catch {
    return value
  }
}

const persistFingerprint = async (data: {
  artists: any[]
  liked_tracks: any[]
  genres: Array<{ name: string; score: number }>
}) => {
  if (!process.client || !profile.value) {
    return
  }

  const cleanUser = cloneForStorage(profile.value)
  const cleanArtists = cloneForStorage(data.artists)
  const cleanTracks = cloneForStorage(data.liked_tracks)
  const cleanGenres = cloneForStorage(data.genres)
  const cleanSeen = existingFingerprint.value
    ? cloneForStorage(existingFingerprint.value.seen_recommendations)
    : []

  const fingerprint: MusicFingerprintPayload = {
    version: 1,
    generated_at: new Date().toISOString(),
    user: cleanUser,
    taste: {
      artists: cleanArtists,
      liked_tracks: cleanTracks,
      genres: cleanGenres
    },
    seen_recommendations: cleanSeen
  }

  try {
    await saveMusicFingerprintToIndexedDB(fingerprint)
    existingFingerprint.value = fingerprint
  } catch (error) {
    console.error('Failed to save fingerprint to IndexedDB', error)
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

const processStreamLine = async (line: string): Promise<boolean> => {
  if (!line.trim()) {
    return false
  }

  let payload:
    | {
        type: 'progress'
        stage: string
        progress?: number
        message?: string
      }
    | {
        type: 'complete'
        cached?: boolean
        data: {
          artists: any[]
          liked_tracks: any[]
          genres: Array<{ name: string; score: number }>
        }
      }
    | {
        type: 'error'
        error?: string
      }

  try {
    payload = JSON.parse(line)
  } catch {
    return false
  }

  if (payload.type === 'progress') {
    progressStage.value = payload.stage
    progressPercent.value =
      typeof payload.progress === 'number'
        ? Math.min(100, Math.max(0, Math.round(payload.progress)))
        : null
    progressMessage.value =
      payload.message ??
      (payload.stage === 'liked_tracks'
        ? 'Fetching liked tracks…'
        : payload.stage === 'followed_artists'
          ? 'Fetching followed artists…'
          : 'Resolving artist details…')
    return false
  }

  if (payload.type === 'complete') {
    result.value = payload.data
    progressStage.value = 'complete'
    progressPercent.value = 100
    progressMessage.value = payload.cached ? 'Loaded from cache' : 'Completed'

    await persistFingerprint(payload.data)
    return true
  }

  if (payload.type === 'error') {
    errorMessage.value = payload.error ?? 'Failed to fetch Spotify data.'
    return true
  }

  return false
}
</script>
