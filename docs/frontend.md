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
| HTTP           | `axios` instance + a `fetch`-based helper for streaming           |
| Editor         | TipTap 3 (note editor with `@mention` of users)                   |
| i18n           | `i18next` + `react-i18next` (el default, en)                      |
| Misc           | `sonner` (toasts), `react-day-picker` (calendar), `cmdk`, `vaul`, `fuse.js`, `date-fns` |

Dev: `bun run dev` → http://localhost:5173 (Docker dev maps 5173; prod nginx → 8081).
Build: `bun run build` → `dist/`, served by nginx (`frontend/Dockerfile`, `nginx.conf`).
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
  icons/              hand-rolled SVG components (OpenAI, Deepseek, Claude, chevrons…)
  Common/             Header, PageRule, SpiralBinding, AudioRecorder, RealtimeAudioRecorder, TiptapEditor/
  Chat/               ChatMessage, StreamChat, CustomMarkdown
  Notes/              NoteComponent, NotesList, NoteEditor, NoteSearch
  Admin/              AdminNotesList, UserSelector
  AppSidebar.tsx      app navigation sidebar
  MainTextarea.tsx    chat composer

context/              React context providers (see "State / providers")
hooks/                useNoteOperations, useRealtimeTranscriber, use-mobile,
                      use-media-query, useFadeInOut, … (useChat.ts is empty/unused)
integrations/         API layer: api.ts (axios + fetchApi), users.ts, lists.ts,
                      threads.ts (chat-thread CRUD)
translations/         i18n.ts (init) + el.ts, en.ts
lib/utils.ts          cn() — clsx + tailwind-merge
utils/                getNowToLocalISOString, handleStreamProcessing
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
         └ WineProvider      domain data (beverages — Qdrant "beverages")
           └ CustomerProvider domain data (polites)
             └ NotesProvider        notes list + CRUD state
               └ NoteEditorProvider open/close + active note id
                 └ SidebarProvider  shadcn sidebar open state
                   └ <App/> + <NoteEditor/>   (+ <Toaster/>)
```

- `NoteEditor` is rendered once at the root (next to `<App/>`) and shown/hidden
  via `NoteEditorContext` — it's a global dialog, not a per-page component.
- `WineProvider`/`CustomerProvider` back domain-specific features; they load data
  unconditionally at app start.
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
  `--color-*` / `--radius-*` / `--shadow-*` tokens. It's a **notebook** theme:
  dark is the hero ("midnight notebook" — warm blue-charcoal paper), light is warm
  ecru paper, and the primary accent (`--primary`) is fountain-pen ink. There is
  exactly **one** deliberate second tone, `--highlight` (amber), used as a
  highlighter swipe (`<mark>` in chat) and the reminder flag — nothing else
  introduces colour (the `--chart-*` ramp is ink + graphite tints, no rainbow).
  Two ambient skeuomorphic touches: **`.nb-paper`** (faint ruled lines + a left
  margin line; `background-attachment: local` so the ruling scrolls with the
  page) on the chat/notes scroll surfaces, and **`SpiralBinding`** — a graphite
  wire coil, a fixed overlay centered on the sidebar/page seam (small muted tilted
  rings straddling it), that tracks the sidebar (visible when expanded, faded out
  when collapsed; hidden on mobile). Fonts are
  loaded via a Google Fonts `<link>` in `index.html` (all with Greek coverage):
  **Inter** (sans / UI), **Literata** (serif — Lexi's chat answers), **JetBrains
  Mono** (mono — code, charts, the `❯` prompt glyphs).
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
to a plain code block, so a half-typed chart never throws). The Greek system prompt
(`backend/utils/gptPromptGenerator.ts`) tells Lexi when to use tables/charts and documents
the exact `chart` schema. The streaming status line is a calm fading mono whisper
(`useFadeInOut` + `statusUpdate`), **not** an animated dot loader.

## API integration (`integrations/api.ts`)

Two HTTP paths, both attaching the Clerk session token as `Authorization: Bearer`:

- **`api`** — an `axios` instance. A request interceptor pulls the token from the
  global `window.Clerk.session.getToken()` (works from non-React modules). Used for
  normal CRUD.
- **`fetchApi(path, opts)`** — a thin `fetch` wrapper used where a `ReadableStream`
  response is needed (the streamed chat answer from `POST /api/search-notes`).
  See `context/StreamChatContext.tsx` + `utils/handleStreamProcessing.ts`.

Base URL is `VITE_API_DEV_URL` in dev, `VITE_API_PROD_URL` in prod build.

## TipTap editor

The note editor (`components/Common/TiptapEditor/`, consumed by
`components/Notes/NoteEditor.tsx` via `useCustomTiptap`) is a TipTap 3 **rich-text**
editor with a formatting toolbar and a user `@mention` dropdown.

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
  (`set-state-in-effect`, `use-memo`) are set to **warn** — pervasive and not
  auto-fixable; remaining hard errors are mostly pre-existing `no-explicit-any`.
- Tailwind v4 has **no `tailwind.config`** — theme tokens live in `index.css`.
