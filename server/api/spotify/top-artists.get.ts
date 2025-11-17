interface SpotifyTopArtistsResponse {
  items: Array<{
    id: string
    name: string
  }>
  total?: number
}

export default defineEventHandler(async (event) => {
  const authorization = getHeader(event, 'authorization')

  if (!authorization || !authorization.startsWith('Bearer ')) {
    setResponseStatus(event, 400)
    return { error: 'Missing Spotify access token.' }
  }

  const accessToken = authorization.replace(/^Bearer\s+/i, '').trim()
  const query = getQuery(event)

  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : 20
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 50 ? limit : 20

  const timeRange = typeof query.time_range === 'string' ? query.time_range : 'medium_term'
  const validRanges = ['short_term', 'medium_term', 'long_term']
  const safeTimeRange = validRanges.includes(timeRange) ? timeRange : 'medium_term'

  const url = `https://api.spotify.com/v1/me/top/artists?limit=${safeLimit}&time_range=${safeTimeRange}`

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

    const data = (await response.json()) as SpotifyTopArtistsResponse

    return {
      items: data.items ?? [],
      total: data.total
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch top artists.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
