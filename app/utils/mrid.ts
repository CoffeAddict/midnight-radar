/**
 * Generates a Midnight Radar ID (MRID) from artist and track name
 * Format: artist_name::track_name (lowercase, spaces replaced with underscores)
 *
 * @param artist - The artist name
 * @param track - The track/song title
 * @returns MRID string in format "artist::track"
 */
export const generateMRID = (artist: string, track: string): string => {
  const normalizeString = (str: string): string => {
    return str
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_') // Replace spaces with underscores
  }

  const normalizedArtist = normalizeString(artist)
  const normalizedTrack = normalizeString(track)

  return `${normalizedArtist}::${normalizedTrack}`
}
