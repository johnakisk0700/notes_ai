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
  Common/             Header, AudioRecorder, RealtimeAudioRecorder, TiptapEditor/
  Chat/               ChatMessage, StreamChat, CustomMarkdown
  Notes/              NoteComponent, NotesList, NoteEditor, NoteSearch
  Admin/              AdminNotesList, UserSelector
  AppSidebar.tsx      app navigation sidebar
  MainTextarea.tsx    chat composer

context/              React context providers (see "State / providers")
hooks/                useChat, useNoteOperations, useRealtimeTranscriber,
                      use-mobile, use-media-query, useFadeInOut, …
integrations/         API layer: api.ts (axios + fetchApi), users.ts, lists.ts
translations/         i18n.ts (init) + el.ts, en.ts
lib/utils.ts          cn() — clsx + tailwind-merge
utils/                getNowToLocalISOString, handleStreamProcessing
assets/flags/         FlagGR, FlagUS
```

## Routing (`App.tsx`)

```
/auth                       LoginPage (public)
─ ProtectedRoute ─ Layout ─┐
  /                         MainChatPage   (wrapped in StreamChatProvider)
  /thread/:thread           MainChatPage   (wrapped in StreamChatProvider)
  /notes                    NotesPage
  /settings                 SettingsPage
  ─ AdminGuard ─┐
    /admin/notes            AdminNotesPage
    /admin/users            UserManagementPage
```

- `ProtectedRoute` and `AdminGuard` (`context/AuthContext/`) gate routes via Clerk
  user + `role` loaded from the backend `profile` table.
- `StreamChatProvider` is mounted per chat route (not globally) so each thread
  starts with a fresh chat state.

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

## shadcn/ui

Config in `frontend/components.json`: style `new-york`, base color `slate`,
CSS variables, `lucide` icons, aliases `@/components`, `@/lib/utils`, `@/components/ui`.

- **Primitives** live in `src/components/ui/` and import from the unified
  **`radix-ui`** package (e.g. `import { Dialog as DialogPrimitive } from "radix-ui"`),
  not the legacy individual `@radix-ui/react-*` packages.
- **Theming** is in `src/index.css`: oklch CSS variables for light (`:root`) and
  dark (`.dark`) plus a Tailwind v4 `@theme inline` block mapping them to
  `--color-*` / `--radius-*` / `--shadow-*` tokens. The palette is grayscale
  (a tweakcn-style theme); fonts: Montserrat (sans), Fira Code (mono).
- **`cn()`** (`src/lib/utils.ts`) merges class names (clsx + tailwind-merge).
- **Local customizations to watch:** `dialog.tsx` adds a non-stock `onPressClose`
  prop (fires on overlay click and the X button) used by the global `NoteEditor`,
  which controls the dialog with `open=` only (no `onOpenChange`). Re-running
  `shadcn add --overwrite` will wipe this — re-apply it after a re-sync.

To update components: `bunx shadcn@latest add <name> --overwrite`. `--overwrite`
replaces the file, so diff afterwards (`git diff`) and restore any local tweaks.

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
`components/Notes/NoteEditor.tsx` via `useCustomTiptap`) is a TipTap 3 editor with
a user `@mention` dropdown.

- Extensions: `Document`, `Paragraph`, `Text`, `Mention`, and `Placeholder`
  (the last now from **`@tiptap/extensions`**, not the removed
  `@tiptap/extension-placeholder`).
- TipTap 3 treats `@tiptap/core`, `@tiptap/pm` and `@tiptap/suggestion` as **peer
  dependencies**, so they are declared explicitly in `package.json` (keep them all
  pinned to the same `3.x` to avoid "multiple instances of @tiptap/core").
- The mention popup (`suggestions.ts`) positions a `ReactRenderer` with **`tippy.js`**
  (an explicit dep — TipTap 3 no longer bundles it). `MentionList.tsx` renders the
  list and handles arrow/enter keys.
- `setContent`'s second argument is an options object in v3
  (`setContent(html, { emitUpdate: false })`), not a boolean.

## Conventions / gotchas

- **Relative imports use `.js` extensions** on `.ts`/`.tsx` files in some places
  (e.g. `./MentionList.js`) — Bun/Vite resolve them; keep the style consistent.
- **Path aliases:** `@/*` → `src` and `@shared` → `../shared` (`vite.config.ts`);
  `@/*`, `@shared`, `@shared/*` in `tsconfig.app.json`. Shared DTOs/types come from
  the `shared/` workspace (`import { Note } from "@shared"` or `"@shared/db/schema/notes"`).
- **Typecheck:** use `bunx tsc --noEmit -p tsconfig.app.json`. Note the `build`
  script is just `vite build` (no `tsc`), so a green build does **not** mean the
  types are clean — there is a backlog of pre-existing unused-symbol errors.
- **Lint:** `bun run lint` (ESLint 10 flat config + `eslint-plugin-react-hooks` v7).
- Tailwind v4 has **no `tailwind.config`** — theme tokens live in `index.css`.
