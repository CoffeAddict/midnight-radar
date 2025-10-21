interface SpotifyProfileResponse {
  display_name?: string | null
  email?: string | null
  country?: string | null
  images?: Array<{ url?: string | null }>
}

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization')

  if (!authorization || !authorization.startsWith('Bearer ')) {
    setResponseStatus(event, 400)
    return { error: 'Missing Spotify access token.' }
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()

  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const message =
        (payload as { error?: { message?: string } } | null)?.error?.message ??
        `Spotify request failed with status ${response.status}`
      throw new Error(message)
    }

    const profile = (await response.json()) as SpotifyProfileResponse

    return {
      displayName: profile.display_name ?? '',
      email: profile.email ?? '',
      country: profile.country ?? '',
      profileImage: profile.images?.[0]?.url ?? null
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch Spotify profile.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
