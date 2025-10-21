import { getRequestURL } from 'h3'
import { randomBytes } from 'node:crypto'

const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-library-read',
  'user-follow-read',
  'user-top-read'
].join(' ')

export default defineEventHandler((event) => {
  const config = useRuntimeConfig(event)
  const clientId =
    config.spotifyClientId ||
    process.env.NUXT_SPOTIFY_CLIENT_ID
  const configuredRedirect =
    config.spotifyRedirectUri ||
    process.env.NUXT_SPOTIFY_REDIRECT_URI

  const requestUrl = getRequestURL(event)
  const fallbackRedirect = new URL('/callback', requestUrl.origin).toString()
  const redirectUri = configuredRedirect || fallbackRedirect

  if (!clientId || !redirectUri) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Spotify credentials are not configured.'
    })
  }

  const state = randomBytes(16).toString('hex')
  setCookie(event, 'spotify_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 600
  })
  setCookie(event, 'spotify_redirect_uri', redirectUri, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 600
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: SPOTIFY_SCOPES
  })

  return sendRedirect(event, `https://accounts.spotify.com/authorize?${params.toString()}`)
})
