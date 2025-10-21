interface SpotifyTokenResponse {
  access_token: string
  token_type: string
  scope: string
  expires_in: number
  refresh_token?: string
}

export default defineEventHandler<Promise<SpotifyTokenResponse>>(async (event) => {
  const config = useRuntimeConfig(event)
  const body = await readBody<{ code?: string; state?: string }>(event)

  if (!body?.code || !body?.state) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing authorization code or state.'
    })
  }

  const storedState = getCookie(event, 'spotify_oauth_state')
  const storedRedirectUri = getCookie(event, 'spotify_redirect_uri')

  if (!storedState || storedState !== body.state) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Authorization session mismatch.'
    })
  }

  setCookie(event, 'spotify_oauth_state', '', {
    path: '/',
    maxAge: 0
  })
  setCookie(event, 'spotify_redirect_uri', '', {
    path: '/',
    maxAge: 0
  })

  const clientId =
    config.spotifyClientId ||
    process.env.NUXT_SPOTIFY_CLIENT_ID
  const clientSecret =
    config.spotifyClientSecret ||
    process.env.NUXT_SPOTIFY_CLIENT_SECRET
  const configuredRedirectUri =
    config.spotifyRedirectUri ||
    process.env.NUXT_SPOTIFY_REDIRECT_URI
  const effectiveRedirectUri = storedRedirectUri || configuredRedirectUri

  if (!clientId || !clientSecret || !effectiveRedirectUri) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Spotify credentials are not configured.'
    })
  }

  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: body.code,
    redirect_uri: effectiveRedirectUri
  })

  const basicToken = Buffer.from(`${clientId}:${clientSecret}`, 'utf8').toString('base64')

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => null)
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to exchange Spotify authorization code.',
      data: errorPayload ?? undefined
    })
  }

  const tokenSet = (await response.json()) as SpotifyTokenResponse

  return tokenSet
})
