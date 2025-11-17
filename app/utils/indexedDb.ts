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
    artists: unknown
    liked_tracks: unknown
    genres: unknown
  }
  seen_recommendations: unknown[]
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
