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
      </section>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

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

const formattedResult = computed(() =>
  result.value ? JSON.stringify(result.value, null, 2) : ''
)
const topGenres = computed(() => (result.value ? result.value.genres.slice(0, 5) : []))

const fetchSpotifyData = async (force = false) => {
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
          if (processStreamLine(line)) {
            done = true
            break
          }
        }
      }
    }

    if (!done && buffer.trim()) {
      processStreamLine(buffer)
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

const processStreamLine = (line: string) => {
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
    return true
  }

  if (payload.type === 'error') {
    errorMessage.value = payload.error ?? 'Failed to fetch Spotify data.'
    return true
  }

  return false
}
</script>
