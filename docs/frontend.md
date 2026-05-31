# Frontend (`frontend/`)

React 19 SPA: users write/record notes and chat over them. Greek/English UI.
Single-page app served statically (nginx in prod, Vite dev server locally).

## Stack

| Concern        | Choice                                                            |
| -------------- | ----------------------------------------------------------------- |
| Framework      | React 19 + TypeScript                                             |
| Build/dev      | Vite 8 (Rolldown bundler) + `@vitejs/plugin-react-swc`            |
| Styling        | Tailwind v4 (`@tailwindcss/vite`) + `tw-animate-css`              |
| UI kit         | shadcn/ui (new-york style) on the unified `radix-ui` package      |
| Icons          | `lucide-react`                                                    |
| Routing        | `react-router` v7 (`BrowserRouter` + `<Routes>`)                  |
| Auth           | Clerk (`@clerk/clerk-react`)                                      |
| HTTP           | `axios` instance (CRUD) + the Vercel AI SDK transport for the chat stream |
| Server state    | `@tanstack/react-query` v5 — chat threads (`['thread', id]` poll-first source of truth, `['threads']` sidebar list). `QueryClientProvider` in `main.tsx`; config in `integrations/queryClient.ts`. Being adopted incrementally (chat first). |
| Editor         | TipTap 3 (note editor; `@mention` of wines + customers + users)   |
| i18n           | `i18next` + `react-i18next` (el default, en)                      |
| Misc           | `sonner` (toasts), `react-day-picker` (calendar), `cmdk`, `vaul`, `fuse.js`, `date-fns` |

Dev: `bun run dev` → http://localhost:5173 (Docker dev maps 5173; prod nginx → 8081).
Build: `bun run build` → `dist/`, served by nginx (`frontend/Dockerfile`, `nginx.conf`).
Routes are **code-split**: each page in `App.tsx` is a `React.lazy()` import under one
`<Suspense>`, and `vite.config.ts` (`rolldownOptions.output.manualChunks`) splits the heavy
vendors (react, tiptap/prosemirror, radix, clerk, markdown) into their own chunks — the entry
bundle is ~260 kB (down from a single ~1.4 MB file).
Env (Vite-inlined): `VITE_API_DEV_URL`, `VITE_API_PROD_URL`, `VITE_CLERK_PUBLISHABLE_KEY`.

## Directory map (`src/`)

```
main.tsx              Root render + the full provider tree (see below)
App.tsx               <Routes> — all route definitions
Layout.tsx            Shell for authed routes: <AppSidebar/> + <Header/> + <Outlet/>

pages/                One component per route
  MainChatPage          "/" and "/thread/:thread" — AI chat (streamed)
  NotesPage             "/notes"
  SettingsPage          "/settings"
  LoginPage             "/auth" (Clerk sign-in/up)
  AdminNotesPage        "/admin/notes"  (admin only)
  UserManagementPage    "/admin/users"  (admin only)

components/
  ui/                 shadcn primitives (~25: button, dialog, sidebar, command,
                      drawer, calendar, popover, sheet, tabs, tooltip, sonner, …)
  icons/              ProviderIcon (brand glyphs for the chat model selector)
  Common/             Header, PageRule, SpiralBinding, TopSpiralBinding, AudioRecorder, RealtimeAudioRecorder, TiptapEditor/
  Chat/               ChatMessage, StreamChat, CustomMarkdown
  Notes/              NoteComponent, NotesList, NoteEditor, NoteSearch
  Admin/              AdminNotesList, UserSelector
  AppSidebar.tsx      app navigation sidebar
  MainTextarea.tsx    chat composer

context/              React context providers (see "State / providers")
hooks/                useNoteOperations, useRealtimeTranscriber, use-mobile,
                      use-media-query, useDebouncedLocalstorageSync, useGlobalAbortController
integrations/         API layer: api.ts (axios), users.ts, lists.ts,
                      threads.ts (chat-thread CRUD)
translations/         i18n.ts (init) + el.ts, en.ts
lib/utils.ts          cn() — clsx + tailwind-merge
utils/                getNowToLocalISOString
assets/flags/         FlagGR, FlagUS
```

## Routing (`App.tsx`)

```
/auth                       LoginPage (public)
─ ProtectedRoute ─ Layout ─┐
  ─ ChatLayout (one StreamChatProvider for both) ─┐
    /                       MainChatPage
    /thread/:thread         MainChatPage
  /notes                    NotesPage
  /settings                 SettingsPage
  ─ AdminGuard ─┐
    /admin/notes            AdminNotesPage
    /admin/users            UserManagementPage
```

- `ProtectedRoute` and `AdminGuard` (`context/AuthContext/`) gate routes via Clerk
  user + `role` loaded from the backend `profile` table.
- `ChatLayout` mounts **one** `StreamChatProvider` for both `/` and `/thread/:thread`,
  so navigating between them (e.g. when a new chat redirects to `/thread/:id`) doesn't
  remount the provider and abort the in-flight stream. The provider reads the active
  thread id from the URL and hydrates that thread's history from the server
  (`GET /api/get-thread`); `/` starts a fresh chat.

## State / providers

Provider tree in `main.tsx` (outermost → innermost):

```
ThemeProvider (dark default, localStorage "vite-ui-theme")
 └ BrowserRouter
   └ ClerkProvider (VITE_CLERK_PUBLISHABLE_KEY)
     └ AuthProvider          role/admin resolution on top of Clerk's useUser
       └ UsersProvider       user list (mentions, admin, user selector)
         └ WineProvider      wine names for the editor @-mention (Postgres `wines`, cached)
           └ CustomerProvider customer names for the editor @-mention (Postgres `customers`, cached)
             └ NotesProvider        notes list + CRUD state
               └ NoteEditorProvider open/close + active note id
                 └ SidebarProvider  shadcn sidebar open state
                   └ <App/> + <NoteEditor/>   (+ <Toaster/>)
```

- `NoteEditor` is rendered once at the root (next to `<App/>`) and shown/hidden
  via `NoteEditorContext` — it's a global dialog, not a per-page component.
- `WineProvider`/`CustomerProvider` load the wine/customer name lists (from Postgres,
  cached in localStorage) that feed the editor's `@`-mention menu alongside the user list.
- `ThreadsProvider` (`context/ThreadsContext`) is **not** in the root tree above —
  it's mounted in `Layout`, so it only fetches the chat-thread list once
  authenticated. It backs the sidebar list and is refreshed when a new thread is created.

## shadcn/ui

Config in `frontend/components.json`: style `new-york`, base color `slate`,
CSS variables, `lucide` icons, aliases `@/components`, `@/lib/utils`, `@/components/ui`.

- **Primitives** live in `src/components/ui/` and import from the unified
  **`radix-ui`** package (e.g. `import { Dialog as DialogPrimitive } from "radix-ui"`),
  not the legacy individual `@radix-ui/react-*` packages.
- **Theming** is in `src/index.css`: oklch CSS variables for light (`:root`) and
  dark (`.dark`) plus a Tailwind v4 `@theme inline` block mapping them to
  `--color-*` / `--radius-*` / `--shadow-*` tokens. The base look is a **notebook**:
  dark "midnight notebook" (warm blue-charcoal paper), light warm ecru, fountain-pen
  ink accent (`--primary`), and one deliberate second tone `--highlight` (amber) for
  the `<mark>` swipe (the `--chart-*` ramp is ink + graphite, no rainbow).
- **Palettes (pluggable themes).** On top of light/dark there's an orthogonal palette
  axis: each palette is a self-contained file in `src/themes/*.css` overriding the base
  tokens under `[data-theme="<name>"]:not(.dark)` / `[data-theme="<name>"].dark`
  (specificity 0,2,0 — wins over `:root`/`.dark` regardless of `@import` order, and the
  `:not(.dark)`/`.dark` pair prevents light↔dark leakage). The selector is **element-scoped**
  (not pinned to `<html>`), so any wrapper can render a palette in isolation — the
  `SettingsPage` palette gallery previews **every** theme live by setting `data-theme` on each
  card. The base palette `classic` lives on `:root`/`.dark` and is **also** addressable as
  `[data-theme="classic"]` for that same nested-preview reason. To add one: create the file,
  `@import` it in `index.css`, and append it to `ThemeProvider`'s `PALETTES`.
  `ThemeProvider` sets `data-theme` on `<html>` (state + `localStorage`; default =
  `paper` / Graphite Paper; `classic` = no attribute when active globally = the base look) and
  `SettingsPage` exposes a reworked picker: a light/dark/**system** segmented control plus a
  visual palette gallery (each card a live mini-page in that palette's paper/ink/highlighter),
  alongside the language toggle and an account card. Shipped: `paper`
  (Graphite Paper, neutral), `classic` (Midnight Ecru), `warm` (Warm Linen), `sage`
  (Sage Ledger), and `copper` (Copper Ink). `paper.css` is the documented template.
  Stale saved palette values are ignored, so removed palettes fall back to the default.
- Ambient skeuomorphic touches: the page is **line-less paper** now — `.nb-paper` /
  `.nb-margin-rule` are inert hooks (no ruling, no margin line). Texture is a **`.nb-page`**
  background (`--nb-grain`, blended `soft-light`). `index.css` holds a small **paper-texture
  library** (`--tex-*`, tone-neutral SVG noise) and each palette picks a **page grain + a
  finer sidebar "cover stock" from one family**: `classic` warm fractal `grain`, `paper`
  clean cold-press `tooth`, `copper` coarse hand-made `rough`, `sage` vertical `laid` lines,
  `warm` woven `linen` crosshatch (`--nb-grain` / `--nb-grain-sidebar`, remapped per palette
  in `themes/*.css`; amplitude = the `feComponentTransfer` slope). The sidebar carries the
  family's `-fine` cut (`--nb-grain-sidebar`) — a quieter cover stock, not a different material. Two
  graphite wire coils share `.nb-coil-wire`, coloured by **`--nb-binder`** (tokenised so a
  future Settings control can recolour the binding): **`SpiralBinding`** (fixed overlay on
  the sidebar/page seam, tracks the sidebar, hidden on mobile) and **`TopSpiralBinding`**
  (loops along a top edge — crowns the note-editor dialog as a top-bound steno pad). Fonts
  load via a Google Fonts `<link>` in `index.html` (Greek coverage): **Inter** (sans/UI),
  **Literata** (serif — the **Mneme** wordmark / brand, `--font-serif`), **Alegreya**
  (serif — Lexi's answers, the softer book voice behind `--font-reading`; `.chat-md` +
  the reasoning disclosure), **JetBrains Mono** (mono — code, charts, `❯`).
- **`cn()`** (`src/lib/utils.ts`) merges class names (clsx + tailwind-merge).
- **Local customizations to watch:** `dialog.tsx` adds a non-stock `onPressClose`
  prop (fires on overlay click and the X button) used by the global `NoteEditor`,
  which controls the dialog with `open=` only (no `onOpenChange`). Re-running
  `shadcn add --overwrite` will wipe this — re-apply it after a re-sync.

To update components: `bunx shadcn@latest add <name> --overwrite`. `--overwrite`
replaces the file, so diff afterwards (`git diff`) and restore any local tweaks.

## Chat rendering

Lexi's answers stream as Markdown and render through `components/Chat/CustomMarkdown.tsx`
(`react-markdown` + `remark-gfm` + `remark-breaks`). Prose is styled by the hand-rolled
`.chat-md` class in `index.css` (serif body, sans headings, ledger-style GFM tables,
task lists, plus notebook expressives: `<mark>` highlighter, `<kbd>` keycaps, and
constrained "pasted clipping" `<img>`) — there is **no `@tailwindcss/typography`**;
the old `prose prose-sm` classes were a no-op and have been removed. `CustomMarkdown`
extends the rehype-sanitize default (GitHub) schema to additionally allow
`mark`/`kbd`/`sub`/`sup` so Lexi can emit those tags as raw HTML. A fenced code block tagged `chart` (i.e. ` ```chart `)
carrying a small JSON spec is routed to `components/Chat/NotebookChart.tsx`, a
zero-dependency SVG bar / line / sparkline renderer (invalid or mid-stream JSON falls back
to a plain code block, so a half-typed chart never throws). Note the `chart` schema is no
longer described to the model — Lexi's current inline system prompt (`lexiSystemPrompt` in
`backend/services/ai/agentic-rag.ts`) carries only persona + answer policy, and the SDK
injects the tool schemas; re-add chart guidance there if the fence is still wanted. The
pre-answer status is a calm rotating mono whisper (`components/Chat/ThinkingIndicator.tsx`,
shown while no answer text has streamed yet), **not** an animated dot loader.
The dated "Ask Lexi" introduction is a header-height first row inside the scrolling
conversation, aligned with the floating sidebar toggle, so it clears above the viewport
as messages begin; on narrow screens it keeps only the date.
Every non-chat route renders through the shared **`<Page>`** wrapper (`components/Common/Page.tsx`):
one scroll surface + a centered, guttered, vertically-padded content column at a standard width
(`prose` / `wide` / `full`), so pages position identically and the spacing lives in one place. Pages
pass an optional `title` (rendered as a `PageRule`); the **floating sidebar toggle** sits in that
title's left margin and mirrors the sidebar's settings gear across the seam — a ghost button at the
same `size-7`, same 14px top offset, and the same inset from the seam, so the two read as a reflection. The toggle is an absolute overlay that reserves no layout space, so
content stays full-width (key on mobile) and the paper runs to the top edge — titled pages align the
title to it, untitled ones just clear it. The **chat page is the sole exception** for positioning: it
fills the view and manages its own scroll under that floating toggle.

## API integration (`integrations/api.ts`)

- **`api`** — an `axios` instance for normal CRUD. A request interceptor attaches the
  Clerk session token (`window.Clerk.session.getToken()`, so it works from non-React
  modules) as `Authorization: Bearer`.
- **Chat stream** — `POST /api/search-notes` is consumed via the **Vercel AI SDK**:
  `@ai-sdk/react`'s `useChat` with a `DefaultChatTransport` whose own `fetch` injects the
  same Clerk token (`context/StreamChatContext.tsx`). There is no hand-rolled stream helper.
- **Poll-first chat durability** — the live `useChat` stream is a best-effort overlay; the
  **source of truth** is `useQuery(['thread', id])` (TanStack Query), which polls while the turn
  is still generating and catches up on reconnect/foreground (built for flaky mobile). The
  finished turn is written into the cache optimistically then reconciled. Helpers:
  `integrations/threadQueries.ts` (keys, poll decider, `mintObjectId`), `integrations/threadMessages.ts`
  (DTO↔UIMessage mapping + the optimistic projection). Full design: `docs/chat-durability-plan.md`.
- **Note-action cards** — `NotePreviewCard` renders the `create_note` and `edit_note` tool parts,
  keyed off each tool's `mode`: `create_note` → saved note (`save`) or opened-in-editor draft (`draft`);
  `edit_note` → updated-&-saved (`save`) or, for `propose`, a **word-level inline diff** (jsdiff `diffWords`,
  Unicode-aware so Greek tokenizes by word — only the changed words are tinted, not two full copies) that
  the user Applies/Discards. (The old
  `propose_note_edit` / `draft_note` part names still render, for threads from before the consolidation.)
  Apply/Discard/manual-retry outcomes are written back to the thread with
  `POST /api/update-tool-transaction` and patched into the TanStack cache, so a refresh keeps the
  card in its terminal state instead of returning to a spinner or pending buttons.
- **Tool / reasoning chips never stick on a spinner** — the generic `ToolCallCard` (search_notes,
  lookup_names, web_search, …) and `ReasoningCard` show a spinner ONLY while their turn is still live.
  Each is passed a `settled` flag (`!streaming`, derived from the message's `status`); once the turn
  is `complete`/`error` a chip can't spin, even if the AI SDK live overlay left its part at
  `input-available` and the poll/reconcile race preserved that copy (the reported "returned a result
  but stayed loading" bug). The decision is the pure `toolCallVisualState` helper
  (`components/Chat/toolCardState.ts`, unit-tested): `error` on a hard `output-error` **or** a web
  tool's self-reported `{ ok:false }`, else `done` when output is in hand or the turn settled, else
  `running`. The note-action cards apply the same backstop — a turn that settles with no result shows
  a terminal state, not a forever-spinner.

Base URL (`BASE_URL`) is `VITE_API_DEV_URL` in dev, `VITE_API_PROD_URL` in prod build.

## TipTap editor

The note editor (`components/Common/TiptapEditor/`, consumed by
`components/Notes/NoteEditor.tsx` via `useCustomTiptap`) is a TipTap 3 **rich-text**
editor with a formatting toolbar and an `@mention` dropdown (wine + customer + user names,
merged and deduped — fuzzy-matched with `fuse.js`).

- Extensions: **`StarterKit`** (`@tiptap/starter-kit` — Document/Paragraph/Text plus
  bold, italic, strike, code, headings, lists, blockquote), **`Markdown`**
  (`@tiptap/markdown`), `Mention`, and `Placeholder` (the last from
  **`@tiptap/extensions`**, not the removed `@tiptap/extension-placeholder`).
  Underline is disabled in StarterKit (`underline: false`) — it has no Markdown form.
- **Notes are persisted as Markdown**, not plain text. Load with
  `setContent(md, { contentType: 'markdown' })` and read back with
  `editor.getMarkdown()` (both provided by `@tiptap/markdown` via module
  augmentation). This keeps the embedding/LLM context clean (no HTML tags), so the
  backend needs no stripping. Legacy plain-text notes are valid Markdown and load
  unchanged. Note cards (`NoteComponent.tsx`) render content through the shared
  `CustomMarkdown`; prose styles live in `index.css` (`.tiptap` + `.note-md`).
- The toolbar (`components/Notes/NoteToolbar.tsx`) reads active state via
  **`useEditorState`** — required because TipTap 3's `useEditor` no longer re-renders
  on every transaction, so `editor.isActive(...)` alone wouldn't update the toggles.
  Toggle buttons `preventDefault` on mousedown to keep the editor selection.
- TipTap 3 treats `@tiptap/core`, `@tiptap/pm` and `@tiptap/suggestion` as **peer
  dependencies**, so they are declared explicitly in `package.json` (keep them all
  pinned to the same `3.x` to avoid "multiple instances of @tiptap/core").
- The mention popup (`suggestions.ts`) positions a `ReactRenderer` with **`tippy.js`**
  (an explicit dep — TipTap 3 no longer bundles it). `MentionList.tsx` renders the
  list and handles arrow/enter keys.
- `setContent`'s second argument is an options object in v3
  (`setContent(md, { emitUpdate: false, contentType: 'markdown' })`), not a boolean.

## Conventions / gotchas

- **Relative imports use `.js` extensions** on `.ts`/`.tsx` files in some places
  (e.g. `./MentionList.js`) — Bun/Vite resolve them; keep the style consistent.
- **Path aliases:** `@/*` → `src` and `@shared` → `../shared` (`vite.config.ts`);
  `@/*`, `@shared`, `@shared/*` in `tsconfig.app.json`. Shared DTOs/types come from
  the `shared/` workspace (`import { Note } from "@shared"` or `"@shared/db/schema/notes"`).
- **Typecheck:** `bunx tsc --noEmit -p tsconfig.app.json --ignoreDeprecations 6.0`
  (TS 6.0 errors on the `baseUrl` option without the flag). The `build` script is
  just `vite build` (no `tsc`), so a green build does **not** mean types are clean —
  there's a backlog of pre-existing unused-symbol errors.
- **Lint/format:** `bun run lint` (ESLint 10 flat config). `bun run lint:fix`
  auto-removes dead imports (`eslint-plugin-unused-imports`) and rewrites to
  `import type` (`@typescript-eslint/consistent-type-imports`); `bun run format`
  runs Prettier (`.prettierrc`). The react-hooks v7 React-Compiler rules
  (`set-state-in-effect`, `use-memo`) are set to **warn**, as is `no-explicit-any` —
  pervasive and not auto-fixable, so warnings don't fail `bun run lint`. (A few genuine
  errors remain — React-Compiler rule violations in `Mermaid.tsx` / `StreamChatContext.tsx`.)
- **No raw `console.*` in shipped code** — frontend logs reach the prod browser console
  (unlike the backend's pino patch). Debug logs are dropped; error logs worth keeping are
  gated behind `if (import.meta.env.DEV)`.
- Tailwind v4 has **no `tailwind.config`** — theme tokens live in `index.css`.
