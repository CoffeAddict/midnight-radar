/**
 * YouTube IFrame Player API composable
 * Handles player initialization, error detection, and auto-skip functionality
 */

// Declare YouTube IFrame API types
declare global {
  interface Window {
    YT: typeof YT
    onYouTubeIframeAPIReady: () => void
  }
}

interface YTPlayer {
  destroy: () => void
  loadVideoById: (videoId: string) => void
}

interface YTPlayerEvent {
  target: YTPlayer
  data: number
}

interface YTPlayerError {
  target: YTPlayer
  data: number // Error code
}

// YouTube IFrame API namespace
namespace YT {
  export class Player {
    constructor(elementId: string, config: {
      videoId: string
      playerVars?: Record<string, any>
      events?: {
        onReady?: (event: YTPlayerEvent) => void
        onStateChange?: (event: YTPlayerEvent) => void
        onError?: (event: YTPlayerError) => void
      }
    })
    destroy(): void
    loadVideoById(videoId: string): void
  }
}

let apiLoaded = false
let apiLoadingPromise: Promise<void> | null = null

/**
 * Load YouTube IFrame API script
 */
const loadYouTubeAPI = (): Promise<void> => {
  if (apiLoaded) {
    return Promise.resolve()
  }

  if (apiLoadingPromise) {
    return apiLoadingPromise
  }

  apiLoadingPromise = new Promise((resolve) => {
    // Check if API is already loaded
    if (window.YT && window.YT.Player) {
      apiLoaded = true
      resolve()
      return
    }

    // Create callback for when API is ready
    window.onYouTubeIframeAPIReady = () => {
      apiLoaded = true
      resolve()
    }

    // Load the API script
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    const firstScriptTag = document.getElementsByTagName('script')[0]
    firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag)
  })

  return apiLoadingPromise
}

export const useYouTubePlayer = () => {
  const player = ref<YTPlayer | null>(null)
  const isReady = ref(false)
  const hasError = ref(false)
  const errorCode = ref<number | null>(null)

  /**
   * Create YouTube player
   * @param elementId - ID of the div element to create player in
   * @param videoId - YouTube video ID
   * @param onError - Callback when player encounters an error
   */
  const createPlayer = async (
    elementId: string,
    videoId: string,
    onError?: (errorCode: number) => void
  ) => {
    if (!process.client) return

    try {
      // Load YouTube API
      await loadYouTubeAPI()

      // Destroy existing player if any
      if (player.value) {
        player.value.destroy()
        player.value = null
      }

      // Reset state
      isReady.value = false
      hasError.value = false
      errorCode.value = null

      // Create new player
      player.value = new window.YT.Player(elementId, {
        videoId,
        playerVars: {
          autoplay: 1, // Autoplay video
          rel: 0, // Don't show related videos
          modestbranding: 1, // Minimal YouTube branding
          fs: 1, // Allow fullscreen
          enablejsapi: 1 // Enable JS API
        },
        events: {
          onReady: (event: YTPlayerEvent) => {
            isReady.value = true
            console.log('✅ YouTube player ready')
          },
          onError: (event: YTPlayerError) => {
            hasError.value = true
            errorCode.value = event.data

            console.error(`❌ YouTube player error: ${event.data}`)

            // Error codes that should trigger auto-skip:
            // 100: Video not found / removed / private
            // 101: Embedding disabled by owner
            // 150: Embedding disabled by owner (alternative code)
            // 153: Missing referer header
            if ([100, 101, 150, 153].includes(event.data)) {
              console.warn(`⚠️ Video cannot be embedded (error ${event.data}) - triggering skip`)
              onError?.(event.data)
            }
          }
        }
      }) as unknown as YTPlayer
    } catch (error) {
      console.error('Failed to create YouTube player:', error)
      hasError.value = true
    }
  }

  /**
   * Destroy player and clean up
   */
  const destroyPlayer = () => {
    if (player.value) {
      try {
        player.value.destroy()
      } catch (error) {
        console.error('Error destroying player:', error)
      }
      player.value = null
    }
    isReady.value = false
    hasError.value = false
    errorCode.value = null
  }

  /**
   * Load a new video in existing player
   */
  const loadVideo = (videoId: string) => {
    if (player.value && isReady.value) {
      player.value.loadVideoById(videoId)
    }
  }

  // Cleanup on unmount
  onUnmounted(() => {
    destroyPlayer()
  })

  return {
    player: readonly(player),
    isReady: readonly(isReady),
    hasError: readonly(hasError),
    errorCode: readonly(errorCode),
    createPlayer,
    destroyPlayer,
    loadVideo
  }
}
