interface MusicBrainzArtist {
  id: string
  name: string
  score?: number
  disambiguation?: string
  country?: string
}

interface MusicBrainzSearchArtistResponse {
  artists: MusicBrainzArtist[]
  count?: number
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const artistName = query.name
  if (!artistName || typeof artistName !== 'string' || !artistName.trim()) {
    setResponseStatus(event, 400)
    return { error: 'Missing or invalid artist name parameter.' }
  }

  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : 1
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 25 ? limit : 1

  // Use Lucene query syntax to search by artist name
  const searchQuery = `artist:"${artistName.replace(/"/g, '\\"')}"`
  const url = new URL('https://musicbrainz.org/ws/2/artist')
  url.searchParams.set('query', searchQuery)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', safeLimit.toString())

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

    const data = (await response.json()) as MusicBrainzSearchArtistResponse

    return {
      artists: data.artists ?? [],
      count: data.count
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to search artist.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
