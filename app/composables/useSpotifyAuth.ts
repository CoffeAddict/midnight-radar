import { computed } from 'vue'

const ACCESS_TOKEN_KEY = 'spotifyAccessToken'
const REFRESH_TOKEN_KEY = 'spotifyRefreshToken'
const EXPIRES_AT_KEY = 'spotifyTokenExpiresAt'
const EXPIRY_GRACE_MS = 60 * 1000 // 1 minute grace

interface SetTokenOptions {
  accessToken: string
  refreshToken?: string | null
  expiresIn?: number
}

export const useSpotifyAuth = () => {
  const accessToken = useState<string | null>('spotify-access-token', () => null)
  const refreshToken = useState<string | null>('spotify-refresh-token', () => null)
  const expiresAt = useState<number | null>('spotify-token-expires-at', () => null)
  const initialized = useState<boolean>('spotify-auth-initialized', () => false)
  const refreshPromise = useState<Promise<string | null> | null>(
    'spotify-refresh-promise',
    () => null
  )

  const loadFromStorage = () => {
    if (!process.client || initialized.value) {
      return
    }

    const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY)
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    const storedExpiresAt = localStorage.getItem(EXPIRES_AT_KEY)

    accessToken.value = storedAccessToken
    refreshToken.value = storedRefreshToken
    expiresAt.value = storedExpiresAt ? Number(storedExpiresAt) : null
    initialized.value = true
  }

  if (process.client) {
    loadFromStorage()
  }

  const isAuthenticated = computed(() => {
    if (!accessToken.value) {
      return false
    }

    if (expiresAt.value && Date.now() > expiresAt.value) {
      return false
    }

    return true
  })

  const setTokens = ({ accessToken: token, refreshToken: refresh, expiresIn }: SetTokenOptions) => {
    const nextRefreshToken = refresh ?? refreshToken.value ?? null
    const nextExpiresAt =
      typeof expiresIn === 'number' ? Date.now() + expiresIn * 1000 : expiresAt.value

    accessToken.value = token
    refreshToken.value = nextRefreshToken
    expiresAt.value = nextExpiresAt

    if (process.client) {
      localStorage.setItem(ACCESS_TOKEN_KEY, token)

      if (nextRefreshToken) {
        localStorage.setItem(REFRESH_TOKEN_KEY, nextRefreshToken)
      } else {
        localStorage.removeItem(REFRESH_TOKEN_KEY)
      }

      if (nextExpiresAt) {
        localStorage.setItem(EXPIRES_AT_KEY, nextExpiresAt.toString())
      } else {
        localStorage.removeItem(EXPIRES_AT_KEY)
      }
    }

    initialized.value = true
  }

  const clearTokens = () => {
    accessToken.value = null
    refreshToken.value = null
    expiresAt.value = null

    if (process.client) {
      localStorage.removeItem(ACCESS_TOKEN_KEY)
      localStorage.removeItem(REFRESH_TOKEN_KEY)
      localStorage.removeItem(EXPIRES_AT_KEY)
    }
  }

  const login = () => {
    if (!process.client) {
      return
    }

    window.location.href = '/api/auth/spotify/login'
  }

  const logout = () => {
    clearTokens()
  }

  const isTokenExpired = () => {
    if (!expiresAt.value) {
      return false
    }

    return Date.now() >= expiresAt.value - EXPIRY_GRACE_MS
  }

  const refreshAccessToken = async (): Promise<string | null> => {
    if (!process.client || !refreshToken.value) {
      return null
    }

    if (!refreshPromise.value) {
      refreshPromise.value = $fetch<{
        access_token: string
        refresh_token?: string
        expires_in?: number
      }>('/api/auth/spotify/refresh', {
        method: 'POST',
        body: {
          refresh_token: refreshToken.value
        }
      })
        .then((data) => {
          if (!data?.access_token) {
            throw new Error('Failed to refresh Spotify access token.')
          }

          setTokens({
            accessToken: data.access_token,
            refreshToken: data.refresh_token ?? null,
            expiresIn: data.expires_in
          })

          return accessToken.value
        })
        .catch((error) => {
          clearTokens()
          throw error
        })
        .finally(() => {
          refreshPromise.value = null
        })
    }

    try {
      return await refreshPromise.value
    } catch {
      return null
    }
  }

  const getValidAccessToken = async (): Promise<string | null> => {
    if (process.client) {
      loadFromStorage()
    }

    if (!accessToken.value) {
      return null
    }

    if (isTokenExpired()) {
      try {
        return await refreshAccessToken()
      } catch {
        return null
      }
    }

    return accessToken.value
  }

  const getAuthorizationHeader = async (): Promise<string | null> => {
    const token = await getValidAccessToken()
    return token ? `Bearer ${token}` : null
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    isAuthenticated,
    initialized,
    loadFromStorage,
    setTokens,
    clearTokens,
    login,
    logout,
    refreshAccessToken,
    getValidAccessToken,
    getAuthorizationHeader
  }
}
