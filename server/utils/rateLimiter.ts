/**
 * Centralized rate limiter for external API requests
 *
 * Tracks last request time per API endpoint and enforces minimum delays
 * between consecutive requests to respect API rate limits.
 */

interface RateLimitConfig {
  name: string
  minDelayMs: number
}

interface RateLimitState {
  lastRequestTime: number
}

const rateLimiters = new Map<string, RateLimitState>()

/**
 * Rate limit configurations for each external API
 */
export const RateLimitConfigs = {
  MUSICBRAINZ: {
    name: 'musicbrainz',
    minDelayMs: 1000 // 1 request per second (per MusicBrainz guidelines)
  } as RateLimitConfig,

  SPOTIFY: {
    name: 'spotify',
    minDelayMs: 100 // Conservative limit (Spotify allows more but we don't want to abuse)
  } as RateLimitConfig,

  YOUTUBE: {
    name: 'youtube',
    minDelayMs: 200 // Avoid getting blocked by YouTube
  } as RateLimitConfig,

  YOUTUBE_OEMBED: {
    name: 'youtube_oembed',
    minDelayMs: 100 // Lighter endpoint, can be faster
  } as RateLimitConfig
} as const

/**
 * Enforces rate limit for a specific API by waiting if necessary
 *
 * @param config - Rate limit configuration for the API
 * @returns Promise that resolves when it's safe to make the request
 *
 * @example
 * ```typescript
 * await enforceRateLimit(RateLimitConfigs.MUSICBRAINZ)
 * const response = await fetch(musicbrainzUrl)
 * ```
 */
export const enforceRateLimit = async (config: RateLimitConfig): Promise<void> => {
  const state = rateLimiters.get(config.name) ?? { lastRequestTime: 0 }
  rateLimiters.set(config.name, state)

  const now = Date.now()
  const elapsed = now - state.lastRequestTime

  if (elapsed < config.minDelayMs) {
    const delay = config.minDelayMs - elapsed
    await new Promise((resolve) => setTimeout(resolve, delay))
  }

  state.lastRequestTime = Date.now()
}

/**
 * Wraps a fetch call with automatic rate limiting
 *
 * @param config - Rate limit configuration for the API
 * @param url - URL to fetch
 * @param options - Fetch options
 * @returns Promise with the fetch response
 *
 * @example
 * ```typescript
 * const response = await rateLimitedFetch(
 *   RateLimitConfigs.MUSICBRAINZ,
 *   'https://musicbrainz.org/ws/2/recording?query=...',
 *   { headers: { 'User-Agent': 'MyApp/1.0' } }
 * )
 * ```
 */
export const rateLimitedFetch = async (
  config: RateLimitConfig,
  url: string,
  options?: RequestInit
): Promise<Response> => {
  await enforceRateLimit(config)
  return await fetch(url, options)
}

/**
 * Resets rate limit state for a specific API (useful for testing)
 */
export const resetRateLimit = (config: RateLimitConfig): void => {
  rateLimiters.delete(config.name)
}

/**
 * Resets all rate limit states (useful for testing)
 */
export const resetAllRateLimits = (): void => {
  rateLimiters.clear()
}
