const USER_AGENT = 'Mozilla/5.0'
const YOUTUBE_SEARCH_URL = 'https://www.youtube.com/results'
const YOUTUBE_OEMBED_URL = 'https://www.youtube.com/oembed'

interface YouTubeThumbnail {
  url: string
  width?: number
  height?: number
}

interface YouTubeVideoRenderer {
  videoId?: string
  title?: {
    runs?: Array<{ text?: string }>
  }
  thumbnail?: {
    thumbnails?: YouTubeThumbnail[]
  }
  lengthText?: {
    simpleText?: string
  }
  badges?: Array<{
    metadataBadgeRenderer?: {
      style?: string
    }
  }>
}

interface YouTubeInitialData {
  contents?: {
    twoColumnSearchResultsRenderer?: {
      primaryContents?: {
        sectionListRenderer?: {
          contents?: Array<{
            itemSectionRenderer?: {
              contents?: Array<{
                videoRenderer?: YouTubeVideoRenderer
              }>
            }
          }>
        }
      }
    }
  }
}

export default defineEventHandler(async (event) => {
  const { song, artist, album, release_date } = getQuery(event)

  if (!song || !artist || typeof song !== 'string' || typeof artist !== 'string') {
    setResponseStatus(event, 400)
    return { error: 'Missing song or artist query parameter.' }
  }

  // Build query in format: "{artist} - {track} - {album} - {release_year}"
  let query = `${artist} - ${song}`

  if (album && typeof album === 'string') {
    query += ` - ${album}`
  }

  if (release_date && typeof release_date === 'string') {
    const year = release_date.split('-')[0]
    if (year) {
      query += ` - ${year}`
    }
  }

  const url = new URL(YOUTUBE_SEARCH_URL)
  url.searchParams.set('search_query', query)

  try {
    const response = await rateLimitedFetch(
      RateLimitConfigs.YOUTUBE,
      url.toString(),
      {
        headers: {
          'User-Agent': USER_AGENT
        }
      }
    )

    if (!response.ok) {
      throw new Error(`YouTube request failed with status ${response.status}`)
    }

    const html = await response.text()
    const initialData = extractInitialData(html)

    if (!initialData) {
      throw new Error('Unable to locate YouTube initial data.')
    }

    const video = await findFirstEmbeddableVideo(initialData)

    if (!video) {
      setResponseStatus(event, 404)
      return { error: 'No embeddable result found' }
    }

    return video
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'No video found'
    setResponseStatus(event, 404)
    return { error: message || 'No video found' }
  }
})

const extractInitialData = (html: string): YouTubeInitialData | null => {
  const pattern = /ytInitialData"\]\s*=\s*(\{.+?\});/
  const alternatePattern = /ytInitialData\s*=\s*(\{.+?\});/

  const match = html.match(pattern) ?? html.match(alternatePattern)
  if (!match?.[1]) {
    return null
  }

  try {
    return JSON.parse(match[1]) as YouTubeInitialData
  } catch {
    return null
  }
}

const findFirstEmbeddableVideo = async (
  data: YouTubeInitialData
): Promise<{ videoId: string; url: string; title: string; thumbnail: string } | null> => {
  const contents =
    data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents

  if (!Array.isArray(contents)) {
    return null
  }

  for (const section of contents) {
    const items = section.itemSectionRenderer?.contents

    if (!Array.isArray(items)) {
      continue
    }

    for (const item of items) {
      const renderer = item.videoRenderer

      if (!renderer?.videoId || !isStandardVideo(renderer)) {
        continue
      }

      const isEmbeddable = await checkEmbeddable(renderer.videoId)

      if (!isEmbeddable) {
        continue
      }

      return {
        videoId: renderer.videoId,
        url: `https://www.youtube.com/embed/${renderer.videoId}`,
        title: renderer.title?.runs?.[0]?.text ?? 'Unknown title',
        thumbnail: resolveThumbnail(renderer.thumbnail?.thumbnails)
      }
    }
  }

  return null
}

const isStandardVideo = (video: YouTubeVideoRenderer) => {
  if (!video.lengthText?.simpleText) {
    return false
  }

  const badges = video.badges ?? []
  return !badges.some(
    (badge) => badge.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_SHORTS'
  )
}

const checkEmbeddable = async (videoId: string): Promise<boolean> => {
  try {
    const url = `${YOUTUBE_OEMBED_URL}?url=https://www.youtube.com/watch?v=${videoId}`
    const response = await rateLimitedFetch(
      RateLimitConfigs.YOUTUBE_OEMBED,
      url,
      {
        headers: {
          'User-Agent': USER_AGENT
        }
      }
    )

    return response.ok
  } catch {
    return false
  }
}

const resolveThumbnail = (thumbnails?: YouTubeThumbnail[]): string => {
  if (!thumbnails?.length) {
    return ''
  }

  const sorted = thumbnails
    .slice()
    .sort(
      (a, b) =>
        (b.width ?? 0) * (b.height ?? 0) - (a.width ?? 0) * (a.height ?? 0)
    )

  return sorted[0]?.url ?? ''
}
