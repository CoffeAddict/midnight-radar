<template>
  <main class="flex min-h-screen items-center justify-center px-6">
    <Card class="max-w-xl">
      <CardHeader class="text-center">
        <CardTitle class="text-4xl">Midnight Radar</CardTitle>
        <CardDescription class="text-base">
          Sign in with Spotify to unlock your personalized Midnight Radar experience.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex justify-center">
        <Button
          type="button"
          size="lg"
          @click="login"
        >
          Login with Spotify
        </Button>
      </CardContent>
    </Card>
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
