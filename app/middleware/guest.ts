export default defineNuxtRouteMiddleware(async () => {
  if (process.server) {
    return
  }

  const auth = useSpotifyAuth()
  auth.loadFromStorage()

  const token = await auth.getValidAccessToken()

  if (token) {
    return navigateTo('/home')
  }
})
