<template>
  <main class="flex min-h-screen items-center justify-center bg-neutral-950 text-white px-6">
    <div class="max-w-xl space-y-6 text-center">
      <h1 class="text-4xl font-semibold">Midnight Radar</h1>
      <p class="text-base text-neutral-300">
        Sign in with Spotify to unlock your personalized Midnight Radar experience.
      </p>
      <Button
        type="button"
        @click="login"
      >
        Login with Spotify
      </Button>
    </div>
  </main>
</template>

<script setup lang="ts">
import { Button } from '~/components/ui/button'

definePageMeta({
  middleware: 'guest'
})

const auth = useSpotifyAuth()

const login = () => {
  auth.login()
}
</script>
