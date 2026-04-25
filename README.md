# Nightmare

PR review as a TikTok feed. One open PR per screen, vertical paging, tap 👍 to approve.

## Setup

```bash
npm install
cp .env.example .env
# edit .env, drop in a GitHub PAT with `repo` scope
npx expo start
```

Open the QR code in Expo Go on your phone, or hit `i` / `a` for a simulator.

## Configuration

The repo to review is **hardcoded** at the top of `App.tsx`:

```ts
const REPO_OWNER = 'lawik';
const REPO_NAME = 'nightmare';
```

Change these and reload to point at a different repo.

The GitHub token is read from `EXPO_PUBLIC_GITHUB_TOKEN`. The `EXPO_PUBLIC_` prefix is required — Expo only inlines env vars with that prefix into the client bundle. Without a token you'll hit unauthenticated rate limits and can't approve.

## How it works

- On mount, fetch open PRs from the GitHub REST API and hydrate each with the detail endpoint to get `additions` / `deletions` / `changed_files`.
- Render a vertically paged `FlatList`, one PR per screen (`SCREEN_HEIGHT` snap interval, `pagingEnabled`).
- The currently visible card lazy-loads its files via `onViewableItemsChanged`.
- Tap 👍 → `POST /pulls/{n}/reviews` with `event: APPROVE`. Animates a giant thumbs-up, then the button locks green.
- Pull-to-refresh on the feed re-runs the initial fetch.

## Stack

Expo SDK 50, React Native, TypeScript, `react-native-gesture-handler`. No state library, no UI kit, no navigation library — one screen.
