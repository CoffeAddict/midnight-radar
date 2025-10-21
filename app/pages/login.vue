<template>
  <main class="flex min-h-screen items-center justify-center bg-neutral-950 text-white px-6">
    <div class="max-w-xl space-y-6 text-center">
      <h1 class="text-4xl font-semibold">Midnight Radar</h1>
      <p class="text-base text-neutral-300">
        Sign in with Spotify to unlock your personalized Midnight Radar experience.
      </p>
      <button
        type="button"
        class="rounded-full bg-emerald-500 px-6 py-2 text-sm font-medium text-neutral-900 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
        @click="login"
      >
        Login with Spotify
      </button>
    </div>
  </main>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'guest'
})

const auth = useSpotifyAuth()

const login = () => {
  auth.login()
}
</script>
