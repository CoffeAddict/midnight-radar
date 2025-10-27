<template>
  <section class="flex min-h-screen items-center justify-center px-6">
    <Card class="max-w-lg">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl">Finishing Spotify sign in</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <Alert v-if="status === 'loading'">
          <AlertDescription>{{ message }}</AlertDescription>
        </Alert>
        <Alert v-else-if="status === 'success'" class="border-emerald-500/50 text-emerald-300">
          <AlertDescription>{{ message }}</AlertDescription>
        </Alert>
        <Alert v-else variant="destructive">
          <AlertDescription>{{ message }}</AlertDescription>
        </Alert>

        <p v-if="status === 'success'" class="text-sm text-muted-foreground text-center">
          You will be redirected shortly. If not, <NuxtLink to="/" class="underline">head back home</NuxtLink>.
        </p>

        <div v-if="status === 'error'" class="flex justify-center">
          <Button
            type="button"
            @click="retry"
          >
            Try again
          </Button>
        </div>
      </CardContent>
    </Card>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

type Status = 'loading' | 'success' | 'error'

const router = useRouter()
const route = useRoute()
const auth = useSpotifyAuth()
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

    auth.setTokens({
      accessToken: response.access_token,
      refreshToken: response.refresh_token ?? null,
      expiresIn: response.expires_in
    })

    status.value = 'success'
    message.value = 'Spotify account connected successfully.'

    setTimeout(() => {
      router.push('/home')
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
  router.push('/login')
}

const isFetchError = (error: unknown): error is { data?: Record<string, any> } =>
  typeof error === 'object' && error !== null && 'data' in error
</script>
