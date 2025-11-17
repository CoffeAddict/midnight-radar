const DB_NAME = 'midnight_radar'
const DB_VERSION = 1
const STORE_NAME = 'fingerprint_store'
const FINGERPRINT_KEY = 'MRFingerprint'

const OPEN_REQUESTS = new Map<string, Promise<IDBDatabase>>()

const openDatabase = (): Promise<IDBDatabase> => {
  if (OPEN_REQUESTS.has(DB_NAME)) {
    return OPEN_REQUESTS.get(DB_NAME) as Promise<IDBDatabase>
  }

  const request = new Promise<IDBDatabase>((resolve, reject) => {
    if (!process.client) {
      reject(new Error('IndexedDB is only available in the browser.'))
      return
    }

    const openRequest = indexedDB.open(DB_NAME, DB_VERSION)

    openRequest.onupgradeneeded = () => {
      const db = openRequest.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    openRequest.onsuccess = () => {
      resolve(openRequest.result)
    }

    openRequest.onerror = () => {
      reject(openRequest.error ?? new Error('Failed to open IndexedDB.'))
    }
  })

  OPEN_REQUESTS.set(DB_NAME, request)
  return request
}

export interface GenreScore {
  name: string
  score: number
}

export interface MusicFingerprintPayload {
  version: number
  generated_at: string
  user: {
    displayName: string
    email: string
    country: string
    profileImage: string | null
  }
  taste: {
    artists: string[]        // Encoded format: "artist_name::[genre1,genre2]::top"
    liked_tracks: string[]   // Encoded format: "artist_name::track_name::timestamp"
    genres: GenreScore[]
  }
  seen_recommendations: string[]  // MRIDs: "artist_name::track_name"
}

export const saveMusicFingerprintToIndexedDB = async (
  fingerprint: MusicFingerprintPayload
): Promise<void> => {
  if (!process.client) {
    throw new Error('IndexedDB is only available in the browser environment.')
  }

  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(fingerprint, FINGERPRINT_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Failed to save fingerprint.'))
  })
}

export const getMusicFingerprintFromIndexedDB = async (): Promise<MusicFingerprintPayload | null> => {
  if (!process.client) {
    return null
  }

  const db = await openDatabase()

  return await new Promise<MusicFingerprintPayload | null>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(FINGERPRINT_KEY)

    request.onsuccess = () => {
      resolve((request.result as MusicFingerprintPayload | undefined) ?? null)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to read fingerprint.'))
    }
  })
}

// ============================================================================
// RECOMMENDATIONS CACHE
// ============================================================================

const RECOMMENDATIONS_CACHE_KEY = 'MRRecommendationsCache'

export interface RecommendationsCache {
  displayed: string[]  // MRIDs of tracks already shown to user
  no_video: string[]   // MRIDs of tracks with no YouTube video
}

export const getRecommendationsCacheFromIndexedDB = async (): Promise<RecommendationsCache> => {
  if (!process.client) {
    return { displayed: [], no_video: [] }
  }

  const db = await openDatabase()

  return await new Promise<RecommendationsCache>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(RECOMMENDATIONS_CACHE_KEY)

    request.onsuccess = () => {
      const result = (request.result as RecommendationsCache | undefined) ?? {
        displayed: [],
        no_video: []
      }
      resolve(result)
    }

    request.onerror = () => {
      reject(request.error ?? new Error('Failed to read recommendations cache.'))
    }
  })
}

export const saveRecommendationsCacheToIndexedDB = async (
  cache: RecommendationsCache
): Promise<void> => {
  if (!process.client) {
    throw new Error('IndexedDB is only available in the browser environment.')
  }

  const db = await openDatabase()

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put(cache, RECOMMENDATIONS_CACHE_KEY)

    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('Failed to save recommendations cache.'))
  })
}

export const addDisplayedRecommendation = async (mrid: string): Promise<void> => {
  const cache = await getRecommendationsCacheFromIndexedDB()

  if (!cache.displayed.includes(mrid)) {
    cache.displayed.push(mrid)
    await saveRecommendationsCacheToIndexedDB(cache)
  }
}

export const addNoVideoRecommendation = async (mrid: string): Promise<void> => {
  const cache = await getRecommendationsCacheFromIndexedDB()

  if (!cache.no_video.includes(mrid)) {
    cache.no_video.push(mrid)
    await saveRecommendationsCacheToIndexedDB(cache)
  }
}

export const isRecommendationCached = (mrid: string, cache: RecommendationsCache): boolean => {
  return cache.displayed.includes(mrid) || cache.no_video.includes(mrid)
}

export const clearRecommendationsCache = async (): Promise<void> => {
  const emptyCache: RecommendationsCache = {
    displayed: [],
    no_video: []
  }
  await saveRecommendationsCacheToIndexedDB(emptyCache)
}
