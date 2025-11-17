interface SpotifyFollowedArtistsResponse {
  artists: {
    items: Array<{
      id: string
      name: string
    }>
    next: string | null
    total?: number
    cursors?: {
      after?: string
    }
  }
}

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization')

  if (!authorization || !authorization.startsWith('Bearer ')) {
    setResponseStatus(event, 400)
    return { error: 'Missing Spotify access token.' }
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()
  const query = getQuery(event)

  const after = typeof query.after === 'string' ? query.after : null
  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : 50
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 50 ? limit : 50

  let url = `https://api.spotify.com/v1/me/following?type=artist&limit=${safeLimit}`
  if (after) {
    url += `&after=${encodeURIComponent(after)}`
  }

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

    const data = (await response.json()) as SpotifyFollowedArtistsResponse

    return {
      items: data.artists.items ?? [],
      next: data.artists.next,
      total: data.artists.total,
      after: data.artists.cursors?.after ?? null
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch followed artists.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
