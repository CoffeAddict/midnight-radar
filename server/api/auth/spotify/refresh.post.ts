interface SpotifyRefreshResponse {
  access_token: string
  token_type: string
  scope?: string
  expires_in?: number
  refresh_token?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ refresh_token?: string }>(event)
  const refreshToken = body?.refresh_token

  if (!refreshToken) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing refresh token.'
    })
  }

  const config = useRuntimeConfig(event)

  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Spotify credentials are not configured.'
    })
  }

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken
  })

  const basicToken = Buffer.from(
    `${config.spotifyClientId}:${config.spotifyClientSecret}`,
    'utf8'
  ).toString('base64')

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicToken}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    throw createError({
      statusCode: 502,
      statusMessage: 'Failed to refresh Spotify access token.',
      data: payload ?? undefined
    })
  }

  const tokenSet = (await response.json()) as SpotifyRefreshResponse

  return tokenSet
})
