interface MusicBrainzRecording {
  id: string
  title: string
  'artist-credit'?: Array<{
    name?: string
  }>
  isrcs?: string[]
  releases?: Array<{
    id?: string
    barcode?: string
  }>
  rating?: {
    value?: number // 0-100 scale (60 = 3 stars, 80 = 4 stars, 100 = 5 stars)
    'votes-count'?: number
  }
}

interface MusicBrainzRecordingsResponse {
  recordings: MusicBrainzRecording[]
  'recording-count'?: number
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)

  const artistMbid = query.mbid
  if (!artistMbid || typeof artistMbid !== 'string' || !artistMbid.trim()) {
    setResponseStatus(event, 400)
    return { error: 'Missing or invalid artist MBID parameter.' }
  }

  const limit = typeof query.limit === 'string' ? parseInt(query.limit, 10) : 15
  const safeLimit = Number.isFinite(limit) && limit > 0 && limit <= 100 ? limit : 15

  const url = new URL('https://musicbrainz.org/ws/2/recording')
  url.searchParams.set('artist', artistMbid)
  url.searchParams.set('fmt', 'json')
  url.searchParams.set('limit', '50') // Fetch top 50
  url.searchParams.set('offset', '0')
  url.searchParams.set('inc', 'ratings') // Include rating data

  console.log(`[MusicBrainz] Fetching from: ${url.toString()}`)

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

    const data = (await response.json()) as MusicBrainzRecordingsResponse

    const allRecordings = data.recordings ?? []

    console.log(`[MusicBrainz] Artist ${artistMbid}: Fetched ${allRecordings.length} recordings`)

    // Filter: only keep recordings that have a rating (remove unrated)
    const ratedRecordings = allRecordings.filter(r => r.rating?.value !== undefined)

    console.log(`[MusicBrainz] Recordings with ratings: ${ratedRecordings.length}`)

    // Sort by rating descending (highest rated first)
    const sortedRecordings = ratedRecordings.sort((a, b) => {
      const ratingA = a.rating?.value ?? 0
      const ratingB = b.rating?.value ?? 0
      return ratingB - ratingA
    })

    // Return top N recordings
    const topRecordings = sortedRecordings.slice(0, safeLimit)

    console.log(`[MusicBrainz] Returning top ${topRecordings.length} rated recordings`)

    return {
      recordings: topRecordings,
      count: data['recording-count']
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch artist recordings.'
    setResponseStatus(event, 500)
    return { error: message }
  }
})
