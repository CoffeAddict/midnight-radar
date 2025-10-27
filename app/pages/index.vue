<template>
  <main class="flex min-h-screen items-center justify-center px-6">
    <Card class="max-w-md">
      <CardContent class="pt-6 text-center">
        <p class="text-muted-foreground">Redirecting...</p>
      </CardContent>
    </Card>
  </main>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from '#imports'

const router = useRouter()

onMounted(async () => {
  const auth = useSpotifyAuth()
  auth.loadFromStorage()
  const token = await auth.getValidAccessToken()

  if (token) {
    await router.replace('/home')
  } else {
    await router.replace('/login')
  }
})
</script>
