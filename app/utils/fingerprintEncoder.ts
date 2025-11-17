/**
 * Fingerprint encoding/decoding utilities
 * Converts artist and track objects to compact string format
 */

/**
 * Normalizes a string to lowercase with underscores
 */
const normalizeString = (str: string): string => {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

// ============================================================================
// ARTIST ENCODING/DECODING
// ============================================================================

export interface DecodedArtist {
  name: string
  genres: string[]
  isTopArtist?: boolean
}

/**
 * Encodes artist data to compact string format
 * Format: "artist_name::[genre1,genre2]::top"
 *
 * @param name - Artist name
 * @param genres - Array of genre strings
 * @param isTopArtist - Optional top artist flag
 * @returns Encoded string
 */
export const encodeArtist = (
  name: string,
  genres: string[],
  isTopArtist?: boolean
): string => {
  const normalizedName = normalizeString(name)
  const normalizedGenres = genres.map(g => normalizeString(g)).join(',')
  const topFlag = isTopArtist ? '::top' : ''

  return `${normalizedName}::[${normalizedGenres}]${topFlag}`
}

/**
 * Decodes artist string back to object
 * Format: "artist_name::[genre1,genre2]::top"
 *
 * @param encoded - Encoded artist string
 * @returns Decoded artist object
 * @throws Error if format is invalid
 */
export const decodeArtist = (encoded: string): DecodedArtist => {
  if (typeof encoded !== 'string') {
    throw new Error('Invalid artist format: expected string')
  }

  const parts = encoded.split('::')

  if (parts.length < 2) {
    throw new Error(`Invalid artist format: expected "name::[genres]" but got "${encoded}"`)
  }

  const name = parts[0]
  const genresPart = parts[1]
  const isTopArtist = parts[2] === 'top'

  // Parse genres from "[genre1,genre2]" format
  if (!genresPart.startsWith('[') || !genresPart.endsWith(']')) {
    throw new Error(`Invalid artist genre format: expected "[...]" but got "${genresPart}"`)
  }

  const genresString = genresPart.slice(1, -1) // Remove [ and ]
  const genres = genresString ? genresString.split(',') : []

  return {
    name,
    genres,
    ...(isTopArtist && { isTopArtist: true })
  }
}

// ============================================================================
// TRACK ENCODING/DECODING
// ============================================================================

export interface DecodedTrack {
  artist: string
  name: string
  added_at?: string
}

/**
 * Encodes track data to compact string format
 * Format: "artist_name::track_name::2025-10-27T03:57:48Z"
 *
 * @param artistName - First artist name
 * @param trackName - Track title
 * @param addedAt - ISO timestamp of when track was added
 * @returns Encoded string
 */
export const encodeTrack = (
  artistName: string,
  trackName: string,
  addedAt?: string
): string => {
  const normalizedArtist = normalizeString(artistName)
  const normalizedTrack = normalizeString(trackName)
  const timestamp = addedAt ? `::${addedAt}` : ''

  return `${normalizedArtist}::${normalizedTrack}${timestamp}`
}

/**
 * Decodes track string back to object
 * Format: "artist_name::track_name::2025-10-27T03:57:48Z"
 *
 * @param encoded - Encoded track string
 * @returns Decoded track object
 * @throws Error if format is invalid
 */
export const decodeTrack = (encoded: string): DecodedTrack => {
  if (typeof encoded !== 'string') {
    throw new Error('Invalid track format: expected string')
  }

  const parts = encoded.split('::')

  if (parts.length < 2) {
    throw new Error(`Invalid track format: expected "artist::track" but got "${encoded}"`)
  }

  const artist = parts[0]
  const name = parts[1]
  const added_at = parts[2] // Optional timestamp

  return {
    artist,
    name,
    ...(added_at && { added_at })
  }
}
