<template>
  <main class="flex min-h-screen items-center justify-center bg-neutral-950 text-white px-6">
    <p class="text-neutral-300">Redirecting…</p>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'

const router = useRouter()
const auth = useSpotifyAuth()

onMounted(() => {
  auth.loadFromStorage()
  const destination = auth.isAuthenticated.value ? '/home' : '/login'
  router.replace(destination)
})
</script>
