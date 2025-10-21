<template>
  <main class="flex min-h-screen items-center justify-center bg-neutral-950 text-white px-6">
    <div class="max-w-xl space-y-6 text-center">
      <h1 class="text-4xl font-semibold">Midnight Radar</h1>
      <p class="text-base text-neutral-300">
        Connect your Spotify account to start exploring personalized Midnight Radar experiences.
      </p>
      <div class="flex items-center justify-center gap-4">
        <button
          v-if="!isAuthenticated"
          type="button"
          class="rounded-full bg-emerald-500 px-6 py-2 text-sm font-medium text-neutral-900 transition hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
          @click="startLogin"
        >
          Login with Spotify
        </button>
        <button
          v-else
          type="button"
          class="rounded-full border border-neutral-500 px-6 py-2 text-sm font-medium transition hover:bg-neutral-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-100"
          @click="logout"
        >
          Logout
        </button>
      </div>
      <p v-if="isAuthenticated" class="text-sm text-neutral-400">
        You are connected. Feel free to log out when you are done.
      </p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

const accessToken = ref<string | null>(null)

onMounted(() => {
  accessToken.value = localStorage.getItem('spotifyAccessToken')
})

const isAuthenticated = computed(() => Boolean(accessToken.value))

const logout = () => {
  localStorage.removeItem('spotifyAccessToken')
  localStorage.removeItem('spotifyRefreshToken')
  accessToken.value = null
}

const startLogin = () => {
  window.location.href = '/api/auth/spotify/login'
}
</script>
