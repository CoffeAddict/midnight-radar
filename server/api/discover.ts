export default defineEventHandler(async (event) => {
  const { genre, limit } = getQuery(event)

  if (!genre || typeof genre !== 'string' || !genre.trim()) {
    setResponseStatus(event, 400)
    return { error: 'Missing required genre parameter.' }
  }

  const limitValue = typeof limit === 'string' ? parseInt(limit, 10) : Number(limit)
  const safeLimit = Number.isFinite(limitValue) && limitValue > 0 ? limitValue : 10

  const url = new URL('https://musicbrainz.org/ws/2/recording')
  url.searchParams.set('query', `tag:${genre}`)
  url.searchParams.set('limit', safeLimit.toString())
  url.searchParams.set('fmt', 'json')

  try {
    const response = await rateLimitedFetch(
      RateLimitConfigs.MUSICBRAINZ,
      url.toString(),
      {
        headers: {
          'User-Agent': 'MidnightRadar/0.1 (contact: andresrodriguezesteban@gmail.com)'
        }
      }
    )

    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const message =
        (payload as { error?: string } | null)?.error ??
        `MusicBrainz request failed with status ${response.status}`
      throw new Error(message)
    }

    return await response.json()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch recommendations.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
