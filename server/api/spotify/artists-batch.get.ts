interface SpotifyArtistDetails {
  id: string
  name: string
  genres: string[]
}

interface SpotifyArtistsBatchResponse {
  artists: SpotifyArtistDetails[]
}

const MAX_ARTIST_BATCH = 50

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization')

  if (!authorization || !authorization.startsWith('Bearer ')) {
    setResponseStatus(event, 400)
    return { error: 'Missing Spotify access token.' }
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()
  const query = getQuery(event)

  const idsParam = query.ids
  if (!idsParam || typeof idsParam !== 'string' || !idsParam.trim()) {
    setResponseStatus(event, 400)
    return { error: 'Missing or invalid ids parameter.' }
  }

  const ids = idsParam
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, MAX_ARTIST_BATCH)

  if (ids.length === 0) {
    return { artists: [] }
  }

  const url = `https://api.spotify.com/v1/artists?ids=${ids.join(',')}`

  try {
    const response = await rateLimitedFetch(
      RateLimitConfigs.SPOTIFY,
      url,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const errorMessage =
        (payload as { error?: { message?: string } } | null)?.error?.message ??
        `Spotify request failed with status ${response.status}`
      throw new Error(errorMessage)
    }

    const data = (await response.json()) as SpotifyArtistsBatchResponse

    return {
      artists: data.artists ?? []
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch artists batch.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
