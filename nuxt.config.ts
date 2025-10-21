// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxtjs/tailwindcss'],
  css: ['~/assets/css/tailwind.css'],
  runtimeConfig: {
    spotifyClientId: process.env.NUXT_SPOTIFY_CLIENT_ID || '',
    spotifyClientSecret: process.env.NUXT_SPOTIFY_CLIENT_SECRET || '',
    spotifyRedirectUri: process.env.NUXT_SPOTIFY_REDIRECT_URI || ''
  },
  devServer: {
    host: '::'
  }
})
