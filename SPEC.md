# Nightmare — Build Spec

A React Native (Expo) app that turns GitHub PR review into a TikTok-style vertical scroll feed. One PR per screen. Tap 👍 to approve. Keep scrolling to advance.

Repo: `github.com/lawik/nightmare`

---

## Goals & non-goals

**Goals**
- Single-screen, gesture-first PR triage. The reviewer's job is to scroll, glance, and either tap approve or skip.
- Feel: TikTok. Snap-to-screen vertical paging. Big touch targets. Dark UI. Low chrome.
- Real GitHub data via the REST API. Real approvals (`POST /pulls/{n}/reviews`).
- Works on iOS and Android via Expo Go (no native build step required to demo).

**Non-goals (v1)**
- Inline commenting / code suggestions.
- Request-changes flow (leave room for it; don't build it).
- Multi-repo or org-wide queue.
- Auth flow / OAuth — we use a personal access token from `.env`.
- Caching, offline mode, push notifications.

---

## Stack

- **Expo SDK 50+** with TypeScript template
- **React Native 0.73+**
- **react-native-gesture-handler** (root wrapper; future-proofs swipe gestures)
- **No state management library.** Local component state is enough. No Redux, Zustand, or React Query.
- **No UI kit.** Plain `View` / `Text` / `StyleSheet`. No NativeWind, no Tamagui.
- **No navigation library.** It's one screen.

If a dep isn't listed here, don't add it without a reason.

---

## Project layout

```
nightmare/
├── App.tsx                          # Entry: load PRs, render feed
├── app.json                         # Expo config
├── package.json
├── tsconfig.json
├── babel.config.js
├── .env.example
├── .gitignore
├── README.md
└── src/
    ├── components/
    │   ├── PRFeed.tsx               # Vertical paged FlatList of PRs
    │   └── PRCard.tsx               # Full-screen PR card with inner scroll
    └── services/
        └── github.ts                # API client (fetch + types)
```

Keep it flat. No `hooks/`, no `utils/`, no `types/` directory. If a helper is small, inline it.

---

## Configuration

The repo to review is **hardcoded** at the top of `App.tsx`:

```ts
const REPO_OWNER = 'lawik';
const REPO_NAME = 'nightmare';
```

The GitHub token is read from `process.env.EXPO_PUBLIC_GITHUB_TOKEN`. The `EXPO_PUBLIC_` prefix is required — Expo only inlines env vars with that prefix into the client bundle.

`.env.example`:
```
EXPO_PUBLIC_GITHUB_TOKEN=ghp_your_token_here
```

`.gitignore` must include `.env`.

---

## GitHub API client (`src/services/github.ts`)

Three exported functions and two types. No classes, no singletons.

### Types

```ts
export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  user: { login: string; avatar_url: string };
  created_at: string;
  additions?: number;       // only present on detail endpoint
  deletions?: number;       // only present on detail endpoint
  changed_files?: number;   // only present on detail endpoint
  html_url: string;
  state: string;
  draft?: boolean;
  base: { ref: string };
  head: { ref: string };
}

export interface PRFile {
  filename: string;
  status: string;            // "added" | "modified" | "removed" | "renamed"
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;            // unified diff; absent for binary or huge files
}
```

### `fetchPullRequests(owner, repo): Promise<PullRequest[]>`

1. `GET /repos/{owner}/{repo}/pulls?state=open&per_page=30` with auth headers.
2. **Hydrate each PR** by calling `GET /repos/{owner}/{repo}/pulls/{number}` in parallel (`Promise.all`). The list endpoint omits `additions` / `deletions` / `changed_files`; the detail endpoint includes them. Merge detail over list. Swallow per-PR errors (return the un-hydrated PR).
3. Error handling:
   - `404` → return `[]` (repo exists but no PRs, or repo is private and token can't see it — caller decides).
   - `401` → throw `Bad GitHub token. Check .env`
   - `403` → throw `Rate limited or forbidden. Add a GitHub token in .env`
   - other non-OK → throw `GitHub error: {status}`

### `fetchPRFiles(owner, repo, number): Promise<PRFile[]>`

`GET /repos/{owner}/{repo}/pulls/{number}/files?per_page=30`. Throw on non-OK.

### `approvePR(owner, repo, number): Promise<void>`

`POST /repos/{owner}/{repo}/pulls/{number}/reviews` with body:
```json
{ "event": "APPROVE", "body": "👍 LGTM (via Nightmare)" }
```
- If no token configured, throw `No GITHUB_TOKEN — cannot approve` *before* the fetch.
- On non-OK response, include status and the first 80 chars of the response body in the error.

### Headers helper

```ts
const headers = (): Record<string, string> => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
});
```

The token is read once at module load: `const TOKEN = process.env.EXPO_PUBLIC_GITHUB_TOKEN || '';`

---

## `App.tsx`

State machine: **loading → (error | empty | feed)**.

- On mount, call `fetchPullRequests` and store in state.
- **Loading:** centered `ActivityIndicator` + "Loading PRs from {owner}/{repo}…"
- **Error:** 😱 emoji + error message + "retry" button that re-runs the fetch.
- **Empty:** 🎉 + "Inbox Zero" + "No open PRs in {owner}/{repo}" + "refresh" button.
- **Feed:** `<GestureHandlerRootView>` wrapping `<PRFeed prs={prs} owner={...} repo={...} onRefresh={loadPRs} />`. Black background everywhere.

`StatusBar` should be `style="light"` on every state.

---

## `PRFeed` (`src/components/PRFeed.tsx`)

Vertical paged `FlatList`. The TikTok snap is achieved with these props together — all of them matter:

```tsx
<FlatList
  data={prs}
  keyExtractor={(item) => String(item.number)}
  renderItem={({ item, index }) => (
    <PRCard
      pr={item}
      owner={owner}
      repo={repo}
      active={index === activeIndex}
      position={index + 1}
      total={prs.length}
    />
  )}
  pagingEnabled
  snapToInterval={SCREEN_HEIGHT}
  snapToAlignment="start"
  decelerationRate="fast"
  showsVerticalScrollIndicator={false}
  onViewableItemsChanged={onViewableItemsChanged}
  viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
  getItemLayout={(_, index) => ({
    length: SCREEN_HEIGHT,
    offset: SCREEN_HEIGHT * index,
    index,
  })}
  onRefresh={onRefresh}
  refreshing={false}
/>
```

`SCREEN_HEIGHT` from `Dimensions.get('window').height`.

Track which card is currently visible (`activeIndex` state) via `onViewableItemsChanged`. Pass `active` down so cards can lazy-load their files when they come into view.

`onViewableItemsChanged` **must be a stable ref** (`useRef(...).current`) — passing a new function on each render will throw a runtime error.

---

## `PRCard` (`src/components/PRCard.tsx`)

This is the meat. Each card is exactly `SCREEN_HEIGHT` tall and contains:

### Layout (z-ordered, bottom to top)

1. **Inner `ScrollView`** filling the card. Holds all the PR content.
2. **Position pill** — absolute top-center, "3 / 12". Tells reviewer where they are in the queue.
3. **Action rail** — absolute bottom-right, vertical stack: 72×72 circular 👍 button + label. Sits over the scroll content like TikTok's like/comment/share rail.
4. **Big animated thumbs-up overlay** — absolute fill, `pointerEvents="none"`. Hidden by default; pops when approved.

### Inner scroll content (top to bottom)

- **Author header**: 44×44 avatar + `@login` + `#123 · 2h ago` (+ ` · DRAFT` if `pr.draft`).
- **Branch row**: `feature/foo → main` in monospace blue (`#60a5fa`).
- **Title** — large, bold, 22pt.
- **Stats row** — three stats side by side, separated by thin top/bottom borders: `files`, `+added` (green), `-removed` (red).
- **Description** — `pr.body` rendered as plain text. If null/empty, show muted italic "no description provided 🫠". Don't try to render markdown.
- **"changed files" section header** — small uppercase, letter-spaced.
- **File list** — first 12 files. Each row: filename (monospace, ellipsized) + `+N -M` on the right.
- **Diff preview** — the first file with a `patch`, rendered in a dark code box. Show first 40 lines. Color each line by its first character:
  - `+` → green (`#4ade80`)
  - `-` → red (`#f87171`)
  - `@@` → blue (`#60a5fa`) (hunk headers)
  - else → gray (`#aaa`)
- **Footer cue** — at the bottom of the scroll: "swipe up for next PR ⬆️" (or "you're at the end ✨" for the last PR). This is the bridge that tells reviewers the gesture continues.

Top padding on `scrollContent` should be ~100 (so content starts below the position pill); bottom padding ~140 (so content clears the action rail).

### Lazy file loading

```ts
useEffect(() => {
  if (active && files === null) {
    fetchPRFiles(owner, repo, pr.number)
      .then(setFiles)
      .catch(() => setFiles([]));
  }
}, [active]);
```

`null` = not loaded yet (show "loading…"), `[]` = loaded with no files (show "no files"), array = render. Don't refetch if the card scrolls back into view.

### Approve flow

```ts
async function handleApprove() {
  if (approved || approving) return;
  setApproving(true);
  setError(null);
  // animate the big thumbs-up
  // call approvePR
  // on success: setApproved(true)
  // on error: setError(e.message)
  // finally: setApproving(false)
}
```

Button states:
- Default: white border, semi-transparent fill, 👍 emoji.
- Approving: same visual, label changes to "…", taps are no-ops.
- Approved: green fill (`#4ade80`), ✅ emoji, label "approved", taps are no-ops.

If approval fails, render the error in tiny red text below the label (max 90px wide, 3 lines). Don't show a modal or alert.

### Approve animation

Use `Animated` (RN built-in, not Reanimated). One `Animated.Value` for the heart scale.

```ts
Animated.sequence([
  Animated.timing(heartScale, {
    toValue: 1,
    duration: 200,
    easing: Easing.out(Easing.back(2)),
    useNativeDriver: true,
  }),
  Animated.timing(heartScale, {
    toValue: 0,
    duration: 600,
    delay: 400,
    useNativeDriver: true,
  }),
]).start();
```

The overlay's `opacity` is bound to `heartScale` directly; its `scale` interpolates `[0,1] → [0.5, 1.5]`. The emoji inside is `fontSize: 200`.

---

## Visual design

Everything is dark.

- Page background: `#000`
- Card background: `#0a0a0a`
- Subtle borders / dividers: `#1a1a1a`
- Code box background: `#111`
- Primary text: `#fff`
- Secondary text: `#ddd`
- Muted text: `#888`
- Very muted: `#666`, `#444`
- Accent green (additions, approved): `#4ade80`
- Accent red (deletions, error): `#f87171`
- Accent blue (branch names, hunk headers): `#60a5fa`

Monospace via `fontFamily: 'Courier'` — works on both platforms without bundling a font.

No shadows, no gradients, no rounded corners except on pills and the approve button. Trust the type and the spacing.

---

## Helper: `timeAgo(iso: string): string`

Inline in `PRCard.tsx`. Returns `Xm ago`, `Xh ago`, or `Xd ago` based on diff from `Date.now()`. Don't pull in date-fns.

---

## Files to write

### `package.json`
```json
{
  "name": "nightmare",
  "version": "0.1.0",
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "expo": "~50.0.14",
    "expo-status-bar": "~1.11.1",
    "react": "18.2.0",
    "react-native": "0.73.6",
    "react-native-gesture-handler": "~2.14.0"
  },
  "devDependencies": {
    "@babel/core": "^7.20.0",
    "@types/react": "~18.2.45",
    "typescript": "^5.1.3"
  },
  "private": true
}
```

### `app.json`
```json
{
  "expo": {
    "name": "Nightmare",
    "slug": "nightmare",
    "version": "0.1.0",
    "orientation": "portrait",
    "userInterfaceStyle": "dark",
    "ios": { "supportsTablet": false, "bundleIdentifier": "com.lawik.nightmare" },
    "android": { "package": "com.lawik.nightmare" },
    "plugins": ["expo-status-bar"]
  }
}
```

### `babel.config.js`
```js
module.exports = function (api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
```

### `tsconfig.json`
```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true }
}
```

---

## Build order

Build in this order so each step is independently runnable:

1. **Scaffold + config** — `package.json`, `app.json`, `babel.config.js`, `tsconfig.json`, `.gitignore`, `.env.example`. Run `npm install` and `npx expo start` to confirm a stock app boots.
2. **`src/services/github.ts`** — types + three functions. Test the read path against a public repo without a token (rate-limited but works).
3. **`App.tsx`** — loading / error / empty / feed states. Stub the feed as a single `<Text>{prs.length} PRs</Text>` first to verify data flow.
4. **`src/components/PRFeed.tsx`** — paged FlatList with a placeholder card (just a colored full-screen `View` with the PR title). Confirm snap behavior works on a real device.
5. **`src/components/PRCard.tsx`** — content first, action rail second, animation last.
6. **`README.md`** — setup, configuration note about hardcoded repo, brief mechanism explainer.

---

## Validation

Manually verify on a device or simulator:
- [ ] App boots to a black screen, then shows the feed.
- [ ] Vertical scroll snaps cleanly between PRs (no halfway state).
- [ ] Within a card, content scrolls smoothly. Hitting the bottom and continuing to swipe advances to the next PR.
- [ ] Position pill updates as you scroll between cards.
- [ ] Diff preview is colorized correctly (greens, reds, blues).
- [ ] 👍 button: tap once → animation plays → button turns green with ✅. Subsequent taps are no-ops.
- [ ] With a bad token: error state shows on launch with a working retry button.
- [ ] With no PRs: "Inbox Zero" state shows.
- [ ] Pull-to-refresh on the feed re-fetches.

---

## Things to deliberately leave unbuilt

These are obvious next features. **Do not build them in v1.** Leave clean seams so they're easy to add:

- **Request changes** via swipe-down or long-press. The action rail is already an absolute-positioned stack — adding a 👎 button below 👍 is mechanical.
- **Per-file paging within a card** (horizontal swipe between files). The diff renderer is already isolated — wrap it in a horizontal FlatList later.
- **Comment composer** on long-press of a diff line. Out of scope.
- **Multi-repo queue.** `REPO_OWNER` / `REPO_NAME` are constants now; later they'd come from a settings screen or env.

---

## Style conventions

- TypeScript strict mode on. No `any` except where the GitHub API response is genuinely unknown shape.
- Functional components only. Hooks for state.
- `StyleSheet.create` at the bottom of each file. No inline style objects except for animated/computed values.
- One component per file. Helpers (`Stat`, `timeAgo`) live in the same file as their only consumer.
- No abbreviations in component names. `PRCard` is fine because PR is the domain noun. `PRFeed`, not `Feed`.
