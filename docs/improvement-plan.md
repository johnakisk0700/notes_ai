# gui_v2 — Improvement Plan

A backlog of recommended fixes/enhancements for the `gui_v2` frontend, written as a
pickup plan for a future session. Compiled 2026-05-25, right after the
all-latest dependency upgrade (Vite 8/Rolldown, React 19.2, TS 6, ESLint 10,
TipTap 3, shadcn re-synced onto the unified `radix-ui` package — see
`docs/frontend.md` and the git log).

**Baseline state to know going in:**
- `bun run build` (just `vite build`, no `tsc`) is **green**.
- `bunx tsc --noEmit -p tsconfig.app.json` has **~32 pre-existing errors**.
- `bun run lint` has **~60 errors / 20 warnings** (pre-existing).
- The build does **not** gate on types/lint, so "build passes" ≠ "types clean".

Each item notes: **what / why / where / how / verify**, and whether it's a
**[verified]** observation or **[investigate]** (needs confirmation first).

---

## P1 — Correctness & functional gaps

### 1. Sidebar shows MOCK chat threads, not real ones  **[verified]**
- **Where:** `src/components/AppSidebar.tsx` — `const fakeThreads = [...]` (15+
  hardcoded titles like "React Performance Optimization") is rendered (~line 191).
- **Why it matters:** real chat threads live in MongoDB and the app has a
  `/thread/:thread` route, but the sidebar navigation is entirely fake.
- **How:** add a threads endpoint consumer (check `docs/api-reference.md` /
  `backend/model/mongo-db/` for the threads API), fetch the user's threads, render
  them, and link to `/thread/:id`. Remove `fakeThreads`.
- **Verify:** sidebar lists the user's actual threads; clicking one loads it.

### 2. TipTap 3 editor + @mention popup needs runtime QA  **[verified]**
- **Where:** `src/components/Notes/NoteEditor.tsx`,
  `src/components/Common/TiptapEditor/{TiptapEditor,suggestions,MentionList}.tsx`.
- **Why:** the v2→v3 migration is build-green but the mention dropdown (`tippy.js`)
  is runtime-only and was never browser-tested.
- **How:** open a note, type `@`, confirm the dropdown appears, filters (fuse.js),
  positions correctly, and inserts a mention. Test on mobile widths too.

### 3. Clean the typecheck/lint backlog  **[verified]**
- **Where:** ~32 `tsc` errors, ~60 lint errors across `src/` (+ a few in `../shared`).
  Mostly `TS6133` unused symbols and `@typescript-eslint/no-unused-vars`.
- **Real bug hiding in there:** `src/components/Common/TiptapEditor/MentionList.tsx`
  (~line 70) — the `ref={el => (itemRefs.current[index] = el)}` callback **returns a
  value**, which React 19 now rejects (TS2322). Fix to a block body:
  `ref={el => { itemRefs.current[index] = el; }}`.
- **How:** triage `bunx tsc --noEmit -p tsconfig.app.json`; remove dead
  imports/vars; fix the ref callback; address the `../shared` `TS1484` type-only
  imports (`import type { … }`).
- **Verify:** `tsc` error count trends to 0; `bun run lint` clean.

---

## P2 — Performance

### 4. No code-splitting — one ~1.4 MB JS bundle  **[verified]**
- **Where:** `bun run build` warns "chunks larger than 500 kB"; output is a single
  `index-*.js` (~1.4 MB / ~440 KB gzip). No `React.lazy`/`Suspense`/dynamic imports
  anywhere in `src/`.
- **How:** route-level `React.lazy()` + `<Suspense>` in `App.tsx` for the pages
  (Admin pages especially), and/or `build.rollupOptions.output.manualChunks` (Vite 8
  → `rolldownOptions`) to split vendor (react, radix-ui, tiptap, prosemirror).
- **Verify:** multiple chunks, smaller initial bundle, warning gone.

### 5. Domain providers load unconditionally at startup  **[investigate]**
- **Where:** `WineProvider` + `CustomerProvider` wrap the whole app in `main.tsx` and
  appear to fetch data on mount regardless of route.
- **How:** confirm what they fetch; scope them to the routes that use them (or make
  the fetch lazy). Saves startup requests for users who never hit those features.

### 6. Consider `@vitejs/plugin-react` over `-swc` for Rolldown  **[verified, optional]**
- **Why:** Vite 8 dev prints "switch to `@vitejs/plugin-react` for improved
  performance as no swc plugins are used" (it uses oxc under Rolldown).
- **How:** swap the plugin in `vite.config.ts`; benchmark dev start/HMR.

---

## P3 — Code quality & DX

### 7. No tests at all  **[verified]**
- Add **Vitest + React Testing Library**. Start with high-value, low-UI logic:
  `context/AuthContext/*` guards, `utils/handleStreamProcessing.ts`,
  `hooks/useNoteOperations.ts`, the i18n setup.

### 8. ~22 `console.*` calls ship to the browser  **[verified]**
- Unlike the backend (where `console.*` is piped to pino), these reach the prod
  browser console. Remove debug logs or gate behind a dev-only logger.

### 9. Loose typing  **[verified]**
- `tsconfig.app.json` sets `noImplicitAny: false`; ~11 explicit `any` (e.g.
  `sendQuery(query, setQuery?: any, …)` in `StreamChatContext.tsx`). Tighten
  incrementally, then flip `noImplicitAny` back on.

### 10. Hardcoded strings bypass i18n  **[verified]**
- e.g. TipTap placeholder `'Dear diary...'` (`TiptapEditor.tsx` ~line 65). Route
  user-facing strings through `t()` / `translations/{el,en}.ts`.

### 11. Inconsistent formatting after shadcn re-sync  **[verified]**
- The re-synced `components/ui/*` are now stock-formatted (double quotes) while the
  rest of `src/` uses single quotes. **Add Prettier** (+ `eslint-config-prettier`)
  and format once to normalize. No formatter is configured today.

### 12. Structure tidy-ups  **[verified]**
- Two utility homes: `src/lib/utils.ts` (cn) **and** `src/utils/`. Pick one.
- `AppSidebar.tsx` / `MainTextarea.tsx` sit at `components/` root instead of a
  feature folder.
- Dedupe the Clerk-token logic duplicated between the axios `api` instance and the
  `fetchApi` helper in `integrations/api.ts`.
- Redundant `build-eu` script (identical to `build`) in `package.json`.

### 13. Modernize ESLint config  **[verified]**
- `eslint.config.js` uses `ecmaVersion: 2020` and spreads
  `reactHooks.configs.recommended.rules` rather than the v7 flat preset
  (`reactHooks.configs['recommended-latest']`). Modernize and re-baseline.

---

## P4 — Infra & robustness

### 14. Vite 8 vs Node version  **[verified]**
- Vite 8 wants Node ≥ 20.19 / 22.12; the local/bun runtime reports **Node 22.6.0**
  (dev server warns). It works via bun, but verify the Docker build
  (`oven/bun:1.2-slim` in `gui_v2/Dockerfile`) and any CI use a recent enough Node.

### 15. Refactor the NoteEditor dialog close pattern  **[verified]**
- **Where:** `NoteEditor.tsx` uses `<Dialog open={isOpen}>` with **no
  `onOpenChange`**, plus a custom `onPressClose` prop re-added to `dialog.tsx` and a
  manual `keydown`/Escape listener.
- **Why:** this fights Radix and the custom `onPressClose` gets wiped on every
  `shadcn add --overwrite`. Switching to
  `onOpenChange={(open) => { if (!open) closeEditor() }}` handles Escape, overlay
  click, and the close button uniformly and survives re-syncs.
- **How:** adopt `onOpenChange`, drop the custom `onPressClose` + manual listener,
  keep `dialog.tsx` stock.

---

## Suggested quick wins (do first)
- #3 the `MentionList` ref-callback bug (real React 19 breakage).
- #8 strip `console.*`.
- #11 add Prettier + format (kills a lot of lint noise).
- #1 wire real threads (biggest user-visible win).
- #4 route-level lazy loading (biggest perf win).
