<template>
  <section class="flex min-h-screen items-center justify-center bg-neutral-950 text-white px-6">
    <div class="max-w-lg space-y-4 text-center">
      <h2 class="text-2xl font-semibold">Finishing Spotify sign in</h2>
      <p v-if="status === 'loading'" class="text-neutral-300">
        {{ message }}
      </p>
      <p v-else-if="status === 'success'" class="text-emerald-300">
        {{ message }}
      </p>
      <p v-else class="text-rose-300">
        {{ message }}
      </p>
      <p v-if="status === 'success'" class="text-sm text-neutral-400">
        You will be redirected shortly. If not, <NuxtLink to="/" class="underline">head back home</NuxtLink>.
      </p>
      <div v-if="status === 'error'">
        <button
          type="button"
          class="rounded-full bg-emerald-500 px-6 py-2 text-sm font-medium text-neutral-900 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          @click="retry"
        >
          Try again
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

type Status = 'loading' | 'success' | 'error'

const router = useRouter()
const route = useRoute()
const status = ref<Status>('loading')
const message = ref('Waiting for Spotify authentication...')

const exchangeCode = async (code: string, state: string) => {
  try {
    const response = await $fetch<{
      access_token: string
      expires_in: number
      refresh_token?: string
    }>('/api/auth/spotify/token', {
      method: 'POST',
      body: {
        code,
        state
      }
    })

    localStorage.setItem('spotifyAccessToken', response.access_token)
    if (response.refresh_token) {
      localStorage.setItem('spotifyRefreshToken', response.refresh_token)
    }

    status.value = 'success'
    message.value = 'Spotify account connected successfully.'

    setTimeout(() => {
      router.push('/')
    }, 1500)
  } catch (error: unknown) {
    status.value = 'error'
    if (isFetchError(error) && error?.data?.error_description) {
      message.value = `Spotify authorization failed: ${error.data.error_description}`
      return
    }

    message.value = 'Spotify authorization failed. Please try again.'
  }
}

onMounted(() => {
  const code = route.query.code
  const state = route.query.state

  if (typeof code !== 'string' || typeof state !== 'string') {
    status.value = 'error'
    message.value = 'Missing authorization details. Please retry the sign-in flow.'
    return
  }

  exchangeCode(code, state)
})

const retry = () => {
  router.push('/')
}

const isFetchError = (error: unknown): error is { data?: Record<string, any> } =>
  typeof error === 'object' && error !== null && 'data' in error
</script>
