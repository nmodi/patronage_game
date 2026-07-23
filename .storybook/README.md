# Storybook

Isolated previews for the DOM-overlay UI (`app/game/ui/`) — panels, screens,
and primitives — decoupled from the Babylon canvas and the game loop.

```bash
npm run storybook        # dev server on :6006
npm run build-storybook  # static build -> storybook-static/ (gitignored)
```

## How it fits the app

- **`main.ts`** uses the `@storybook/react-vite` framework and, in `viteFinal`,
  strips the React Router SSR plugin from the merged Vite config (it expects a
  server entry stories don't have) while keeping Tailwind v4 and the `~/` path
  alias. So stories build against the same tokens and imports as the app.
- **`preview.tsx`** loads `app/app.css` (Tailwind + design tokens + the
  `.panel-parchment` texture) and injects the same Google Fonts `<link>` that
  `root.tsx` adds, plus the parchment/night/canvas backgrounds.

## Stories against the store

Most UI panels read `useGameStore` directly rather than taking props. The
`gameState(patch)` decorator (`withGameState.tsx`) seeds the singleton store
from a clean `resetGame("story")` baseline, then layers on a scene. Shared
mock scenes (a plausible mid-game city, artists, commissions, artworks) live in
`mocks.ts`.

```tsx
import { gameState } from "../../../.storybook/withGameState";
import { sampleCity } from "../../../.storybook/mocks";

export const MidGame = { decorators: [gameState(sampleCity)] };
```

Prop-driven components (`Panel`, `ResourceStat`, `ArtworkThumbnail`,
`LoadingScreen`) need no decorator — pass args directly.
