# Midnight Radar

Midnight Radar is a Nuxt 3 single-page application (SPA) designed to explore a listener's Spotify taste, persist a "music fingerprint" locally, and surface fresh recommendations by blending Spotify listening history with third-party discovery sources. This project is a proof-of-concept for building a privacy-friendly recommendation loop that runs primarily in the browser while relying on lightweight server proxies when a public API lacks CORS support.

## Tech Stack

- **Nuxt 3** (Vue 3 + Vite)
- **TypeScript** across both server routes and client modules
- **Tailwind CSS** for minimal styling utilities
- **IndexedDB** for storing per-user fingerprints in the browser
- **Nitro server routes** for all backend endpoints (Spotify auth helpers, MusicBrainz proxy, YouTube search proxy)

## Features

- **Spotify OAuth flow** (handled outside this README) with token refresh support
- **Fingerprint generation** that captures:
  - Followed artists
  - Saved (liked) tracks with recency metadata and primary artist name
  - Aggregated artist genres with recency + follow weighting
- **Fingerprint caching** in IndexedDB under the key `MRFingerprint`
- **Recommendations engine** that:
  - Builds weighted genre selections from the fingerprint
  - Retrieves fresh tracks from MusicBrainz (via `/api/discover` proxy)
  - Filters out previously liked songs by identifier and artist/title pairs
  - Returns 10 novel tracks with associated genres
- **YouTube search proxy** (`/api/youtube-search`) that fetches embeddable videos for the current recommendation and validates them via the oEmbed endpoint
- **Home page** debug carousel that streams fingerprint progress, stores results, and cycles through generated recommendations while showing the embedded YouTube player

---

## Project Structure Overview

```
app/
  composables/
    useSpotifyAuth.ts           # Token management and refresh helpers
    useRecommendationEngine.ts  # MusicBrainz-based recommendation logic
  middleware/
    auth.ts                     # Redirect unauthenticated users to /login
    guest.ts                    # Redirect authenticated users away from /login
  pages/
    index.vue                   # Debug page showing raw recommendations
    login.vue, home.vue, callback.vue  # Primary SPA views
  utils/
    indexedDb.ts                # IndexedDB helpers for saving/loading fingerprints
server/
  api/
    auth/spotify/*.ts           # Login, token exchange, refresh routes
    discover.ts                 # MusicBrainz proxy
    fetch-spotify-user-data.ts  # Fingerprint generator (streams progress)
    spotify-profile.ts          # Minimal Spotify profile fetch
    youtube-search.ts           # Embeddable YouTube search proxy
```

---

## Setup & Development

```bash
# Install dependencies
npm install

# Start dev server (SPA mode)
npm run dev

# Build for production
npm run build

# Optional: Preview production output
npm run preview
```

> **Dev mode HTTPS**: The project originally used HTTPS for local dev. It has since been simplified to HTTP (`http://[::1]:3000/`) for local Spotify redirects. Adjust `.env` as needed.

---

## Fingerprint Generation

The `/api/fetch-spotify-user-data` route is responsible for building the fingerprint. It runs as a streaming response that emits progress events while fetching each dataset. Once complete, it sends a `complete` event with the JSON payload and the client writes it to IndexedDB.

### Saved Tracks

Each liked track is captured as:

```json
{
  "id": "3abc...",
  "name": "Song Title",
  "artist": "Primary Artist",
  "added_at": "2025-10-20T18:22:00Z"
}
```

### Followed Artists

We record each followed artist's ID and name, adding them to the artist ID corpus used later for genre aggregation.

### Artist Genre Weighting

For each artist associated with the user (liked or followed), we request genres and compute weights:

- **Recency decay**: Each liked track contributes `weight = max(0.1, exp(-days / 60))`. New songs count near weight ≈ 1; older songs slowly decay but never disappear completely.
- **Follow boost**: Every followed artist adds `0.5` weight to the artist, ensuring explicit follows have influence even if no recent tracks were liked.

The genre scores are derived by summing these artist weights for every genre and normalizing by the total weight, producing a list such as:

```json
[
  { "name": "deep house", "score": 0.23 },
  { "name": "ambient", "score": 0.18 },
  ...
]
```

These values live under `fingerprint.taste.genres`.

---

## Recommendation Engine

Implemented in `useRecommendationEngine.ts`, the engine works purely on the client (browser) but occasionally calls backend proxies.

### Genre Selection

1. Normalize genre scores so they sum to 1.
2. Draw `GENRE_BATCH_SIZE` (10) selections using weighted random sampling. Repetition is allowed.

### MusicBrainz Fetching (`/api/discover`)

- For each genre, the engine maintains a cached pool of tracks (Map<string, DiscoverRecording[]>).
- When a genre is selected, it checks whether the pool has at least `MIN_GENRE_POOL` (5) tracks. If not, it requests more recordings for that genre.
- Requests are throttled to **one per second** to avoid MusicBrainz rate limits.

### Deduplication Rules

Before a track enters the recommendation pool, we enforce:

- **Artist + Title pair**: Case-insensitive match on `artist` and `title` against the user's liked tracks and any recommendations already selected.
- **Identifier tracking**: MusicBrainz ISRCs and barcodes are used to deduplicate within the recommendation pool itself (to avoid duplicate entries from different MusicBrainz releases).

If pooling pushes the queue below five items, the engine fetches more recordings for that genre.

### Output Format

The final result is an array of 10 recommendations:

```json
[
  {
    "title": "Song Title",
    "artist": "Artist Name",
    "genre": "selected genre",
    "isrc": "optional",
    "mbid": "MusicBrainz ID (optional)"
  }
]
```

The `genre` field indicates which genre draw produced that recommendation, so the UI can display `(genre)` inline.

---

## YouTube Embed Lookup

The `/api/youtube-search` route performs the following steps:

1. Build a query `${song} ${artist} official audio` and fetch the YouTube results page with a desktop user agent.
2. Parse `ytInitialData` from the HTML and iterate video renderers (skipping shorts and other non-standard items).
3. For each candidate `videoId`, call YouTube's oEmbed endpoint (`https://www.youtube.com/oembed`) to verify the video is embeddable.
4. Return the first embeddable match. If no candidates succeed, respond with HTTP 404 `{ error: 'No embeddable result found' }`.

This ensures the frontend can safely embed the returned video without hitting runtime restrictions.

---

## Debugging the Flow

- Visit `/login` to start the Spotify process.
- After sign-in, `/home` auto-generates the fingerprint (or loads it from IndexedDB if already present) and streams progress updates.
- Clicking **Get recommendations** triggers the MusicBrainz workflow, updates the carousel, and fetches the YouTube embed per recommendation.
- `/` (index page) simply runs the recommendation engine once and dumps the raw array for quick inspection.

---

## Environment

Create a `.env` file for Spotify credentials:

```
NUXT_SPOTIFY_CLIENT_ID=<client_id>
NUXT_SPOTIFY_CLIENT_SECRET=<client_secret>
NUXT_SPOTIFY_REDIRECT_URI=http://[::1]:3000/callback
```

> Because fingerprint data and tokens live in the browser, no server-side database is required.

---

## Future Extensions

- Integrate more discovery sources (e.g., Last.fm, Bandcamp, SoundCloud).
- Add dupe detection for more identifier types (MusicBrainz MBIDs, release group IDs).
- Provide auto-play sequencing or queue export to Spotify / YouTube Music.
- Introduce server-side caching for MusicBrainz requests to reduce latency.

---

## License

This project is distributed for educational and experimental purposes. Adapt to your own OAuth credentials and ensure you comply with Spotify, MusicBrainz, and YouTube API terms.
