<template>
  <div>
    <header class="border-b">
      <nav class="container mx-auto px-4 py-3 flex items-center justify-between">
        <ul class="flex items-center space-x-4">
          <li>
            <NuxtLink to="/" class="text-sm font-medium hover:underline">Home</NuxtLink>
          </li>
          <li>
            <NuxtLink to="/components" class="text-sm font-medium hover:underline">Components</NuxtLink>
          </li>
        </ul>

        <div v-if="profile" class="flex items-center gap-3">
          <Avatar>
            <AvatarImage v-if="profile.profileImage" :src="profile.profileImage" :alt="profile.displayName" />
            <AvatarFallback>{{ getInitials(profile.displayName) }}</AvatarFallback>
          </Avatar>
          <span class="text-sm font-medium">{{ profile.displayName }}</span>
          <Button class="ml-4" variant="outline" size="sm" @click="handleLogout">
            Logout
          </Button>
        </div>
      </nav>
    </header>

    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from '#imports'
import Avatar from '~/components/ui/avatar/Avatar.vue'
import AvatarImage from '~/components/ui/avatar/AvatarImage.vue'
import AvatarFallback from '~/components/ui/avatar/AvatarFallback.vue'

// Apply dark mode class to the HTML element using Nuxt's head management
useHead({
  htmlAttrs: {
    class: 'dark'
  }
})

const auth = useSpotifyAuth()
const router = useRouter()

interface SpotifyProfile {
  displayName: string
  email: string
  country: string
  profileImage: string | null
}

const profile = ref<SpotifyProfile | null>(null)

const loadProfile = async () => {
  try {
    const authorizationHeader = await auth.getAuthorizationHeader()
    if (!authorizationHeader) return

    const profileResponse = await $fetch<SpotifyProfile>('/api/spotify-profile', {
      headers: {
        Authorization: authorizationHeader
      }
    })

    profile.value = profileResponse
  } catch (error) {
    console.error('Failed to load profile', error)
  }
}

const getInitials = (name: string) => {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

const handleLogout = () => {
  auth.logout()
  router.push('/login')
}

onMounted(() => {
  auth.loadFromStorage()
  if (auth.getValidAccessToken()) {
    loadProfile()
  }
})
</script>
