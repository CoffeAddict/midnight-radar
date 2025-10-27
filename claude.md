# Claude Guidelines for Midnight Radar

## Project Overview

Midnight Radar is a Nuxt 3 single-page application that helps users explore their Spotify listening taste and discover new music through a privacy-friendly recommendation engine. The app generates a "music fingerprint" from Spotify data, stores it locally in IndexedDB, and surfaces fresh recommendations by blending Spotify history with third-party sources like MusicBrainz and YouTube.

## Tech Stack

- **Nuxt 3** (Vue 3 + Vite) - SPA mode
- **TypeScript** - Used throughout client and server code
- **Tailwind CSS** - For styling utilities
- **shadcn-vue** - Primary UI component library
- **IndexedDB** - Browser-based storage for user fingerprints
- **Nitro server routes** - Backend endpoints for Spotify auth, MusicBrainz proxy, YouTube search

## UI Component Guidelines

### Use shadcn-vue Components

**ALWAYS prefer shadcn-vue components when building or modifying the UI.** Before creating custom components or adding new UI elements:

1. **Check the shadcn-vue component list** at https://www.shadcn-vue.com/docs/components
2. Review available components including:
   - **Button** - For all clickable actions
   - **Card** - For content containers
   - **Input** - For text inputs
   - **Alert** - For notifications and messages
   - **Badge** - For labels and tags
   - **Dialog** - For modals
   - **Dropdown Menu** - For action menus
   - **Select** - For dropdowns
   - **Tabs** - For tabbed interfaces
   - **Tooltip** - For helpful hints
   - **Skeleton** - For loading states
   - And many more...

3. **Installation**: Use the shadcn-nuxt CLI to add components:
   ```bash
   npx shadcn-vue@latest add [component-name]
   ```

4. **Import pattern**: Components are auto-imported from `~/components/ui/[component-name]`
   ```typescript
   import { Button } from '~/components/ui/button'
   import { Card, CardContent, CardHeader } from '~/components/ui/card'
   ```

### Why shadcn-vue?

- Provides consistent, accessible UI components
- Built on Radix Vue (reka-ui) for robust accessibility
- Fully customizable with Tailwind CSS
- Type-safe with TypeScript
- Follows best practices for Vue 3 composition API

## Project Structure

```
app/
  composables/
    useSpotifyAuth.ts           # Token management & refresh
    useRecommendationEngine.ts  # MusicBrainz recommendation logic
  middleware/
    auth.ts                     # Protected route middleware
    guest.ts                    # Guest-only route middleware
  pages/
    index.vue                   # Debug/recommendations display
    login.vue                   # Spotify login page
    home.vue                    # Main app interface
    callback.vue                # OAuth callback handler
    components.vue              # shadcn-vue component showcase
  components/
    ui/                         # shadcn-vue components
  utils/
    indexedDb.ts                # IndexedDB helpers
  lib/
    utils.ts                    # Utility functions (cn helper)

server/
  api/
    auth/spotify/*.ts           # Spotify OAuth flow
    discover.ts                 # MusicBrainz proxy
    fetch-spotify-user-data.ts  # Fingerprint generator
    spotify-profile.ts          # Spotify profile fetch
    youtube-search.ts           # YouTube embed search
```

## Coding Conventions

### TypeScript

- **Always use TypeScript** - No `.js` or `.vue` files without `<script setup lang="ts">`
- Define interfaces for all data structures
- Use type annotations for function parameters and return types
- Leverage auto-imports for composables and components

### Vue 3 Composition API

- Use `<script setup lang="ts">` syntax
- Prefer composables over mixins
- Use `ref` and `reactive` for state management
- Keep components focused and single-purpose

### Styling

- Use **Tailwind CSS** utility classes
- Follow Tailwind's responsive design patterns (`sm:`, `md:`, `lg:` breakpoints)
- Use the `cn()` helper from `~/lib/utils` to merge class names:
  ```typescript
  import { cn } from '~/lib/utils'

  const classes = cn('base-class', conditionalClass && 'conditional-class')
  ```

### File Organization

- **Pages**: Place in `app/pages/` - auto-routed by Nuxt
- **Components**: Place UI components in `app/components/ui/` (shadcn-vue) or `app/components/` (custom)
- **Composables**: Place reusable logic in `app/composables/`
- **Utils**: Place helper functions in `app/utils/`
- **API Routes**: Place server endpoints in `server/api/`

## Architecture Guidelines

### Client-Side First

- The app runs primarily in the browser
- Use IndexedDB for persistent storage (`MRFingerprint` key)
- Server routes are lightweight proxies for CORS-restricted APIs

### Authentication Flow

1. User visits `/login` and initiates Spotify OAuth
2. After authorization, redirect to `/callback` with code
3. Exchange code for tokens via `/api/auth/spotify/callback`
4. Store tokens in browser (localStorage/sessionStorage)
5. Use `useSpotifyAuth` composable for token management
6. Middleware (`auth.ts`) protects authenticated routes

### Fingerprint Generation

- Streaming response from `/api/fetch-spotify-user-data`
- Emits progress events as it fetches:
  - Followed artists
  - Saved tracks (with recency metadata)
  - Artist genres (with weighted scoring)
- Client caches result in IndexedDB

### Recommendation Engine

- Runs client-side via `useRecommendationEngine` composable
- Uses weighted genre selection from fingerprint
- Fetches tracks from MusicBrainz via `/api/discover` proxy
- Deduplicates using ISRC/EAN/UPC and artist+title pairs
- Returns 10 novel recommendations

### YouTube Integration

- `/api/youtube-search` proxy validates embeddable videos
- Searches for `${song} ${artist} official audio`
- Uses oEmbed endpoint to verify embeddability
- Returns first valid video ID or 404

## Important Notes

### Privacy-Friendly Design

- No server-side database required
- User data (fingerprint, tokens) stays in the browser
- Server routes are stateless proxies

### Rate Limiting

- MusicBrainz requests are throttled to **1 per second**
- YouTube search uses desktop user-agent to parse HTML

### Environment Variables

Required in `.env`:
```
NUXT_SPOTIFY_CLIENT_ID=<client_id>
NUXT_SPOTIFY_CLIENT_SECRET=<client_secret>
NUXT_SPOTIFY_REDIRECT_URI=http://[::1]:3000/callback
```

## Development Workflow

### Adding New Features

1. Check if shadcn-vue has relevant components first
2. Create composables for reusable logic
3. Use TypeScript interfaces for data structures
4. Test OAuth flow with valid Spotify credentials
5. Verify fingerprint caching in IndexedDB (DevTools → Application → IndexedDB)

### Debugging

- Use `/components` page to test shadcn-vue components in isolation
- Use `/` (index) page for raw recommendation debugging
- Check browser console for fingerprint/recommendation logs
- Monitor Network tab for API proxy calls

### Adding UI Components

Before creating custom UI:
1. Visit https://www.shadcn-vue.com/docs/components
2. Check if a shadcn-vue component exists
3. If yes, install via CLI: `npx shadcn-vue@latest add [component-name]`
4. If no, build custom component using Tailwind CSS and Vue 3 best practices

## Best Practices

- **Always check shadcn-vue docs before building UI components**
- Maintain TypeScript strict mode compliance
- Use composables for shared logic
- Keep server routes minimal (proxies only)
- Document complex algorithms (fingerprint weighting, genre selection)
- Handle loading/error states gracefully
- Use shadcn-vue's Skeleton component for loading states
- Use shadcn-vue's Alert component for error messages

## Future Considerations

- Additional discovery sources (Last.fm, Bandcamp)
- Enhanced deduplication with MusicBrainz MBIDs
- Auto-play sequencing
- Queue export to Spotify/YouTube Music
- Server-side MusicBrainz caching for performance
