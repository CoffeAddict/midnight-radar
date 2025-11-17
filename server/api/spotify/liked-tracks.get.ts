interface SpotifySavedTrack {
  track: {
    id: string
    name: string
    artists?: Array<{
      id?: string
      name: string
    }>
    album?: {
      id: string
      name: string
      release_date: string
    }
  } | null
  added_at?: string
}

interface SpotifySavedTracksResponse {
  items: SpotifySavedTrack[]
  next: string | null
  total?: number
  limit?: number
  offset?: number
}

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization')

  if (!authorization || !authorization.startsWith('Bearer ')) {
    setResponseStatus(event, 400)
    return { error: 'Missing Spotify access token.' }
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()
  const query = getQuery(event)

  const offset = typeof query.offset === 'string' ? parseInt(query.offset, 10) : 0
  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : 50

  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 50 ? limit : 50

  const url = `https://api.spotify.com/v1/me/tracks?limit=${safeLimit}&offset=${safeOffset}`

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

    const data = (await response.json()) as SpotifySavedTracksResponse

    return {
      items: data.items ?? [],
      next: data.next,
      total: data.total,
      limit: data.limit,
      offset: data.offset
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch liked tracks.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
