// The editor's "@mention" name lists (wines / customers / users), made available to the chat
// model as a fuzzy lookup. These are GLOBAL, app-wide lists — the same ones the editor
// autocomplete reads — NOT "names the user has written about". The model uses them to resolve a
// misspelled/accent-less name to its canonical spelling before searching notes, or to list what's
// on file.
//
// The lists are small and change rarely, so each kind's names are cached in-process behind a short
// TTL; fuzzy ranking runs in-memory with Fuse.js over an accent/case-normalized key — that's what
// lets Greek "παπαδοπουλος" match "Παπαδόπουλος". If the lists ever grow large, move the ranking
// into Postgres (pg_trgm + unaccent) behind this same interface.
import Fuse from "fuse.js";
import { drizzlePg } from "clients/drizzle_postgres_client";
import { winesTable } from "@shared/db/schema/wines";
import { customersTable } from "@shared/db/schema/customers";
import { profileTable } from "@shared/db/schema/profile";

export type LookupKind = "wines" | "customers" | "users";

const CACHE_TTL_MS = 5 * 60_000;

// Combining Diacritical Marks block — what NFD splits an accented letter into.
const COMBINING_MARK_START = 0x0300;
const COMBINING_MARK_END = 0x036f;

// Strip diacritics + lowercase so accents/case never block a match: NFD separates a letter from
// its combining mark, and we drop the marks (covers Greek tonos and Latin accents alike). Done by
// codepoint rather than a regex literal so no invisible combining chars live in this source.
function normalize(text: string): string {
  let out = "";
  for (const ch of text.normalize("NFD")) {
    const code = ch.codePointAt(0)!;
    if (code >= COMBINING_MARK_START && code <= COMBINING_MARK_END) continue;
    out += ch;
  }
  return out.toLowerCase().trim();
}

async function loadNames(kind: LookupKind): Promise<string[]> {
  if (kind === "wines") {
    const rows = await drizzlePg.select({ name: winesTable.name }).from(winesTable);
    return rows.map(r => r.name).filter(Boolean);
  }
  if (kind === "customers") {
    const rows = await drizzlePg.select({ name: customersTable.name }).from(customersTable);
    return rows.map(r => r.name).filter(Boolean);
  }
  // users: build a display name from the profile, mirroring the editor's @mention list.
  const rows = await drizzlePg
    .select({ first: profileTable.first_name, last: profileTable.last_name, email: profileTable.email })
    .from(profileTable);
  return rows.map(r => (r.first && r.last ? `${r.first} ${r.last}` : (r.email ?? ""))).filter(Boolean);
}

const cache = new Map<LookupKind, { at: number; names: string[] }>();

// The full name list for a kind, cached per-worker behind CACHE_TTL_MS so a fuzzy lookup (or the
// editor autocomplete) doesn't re-hit Postgres on every call.
async function allNames(kind: LookupKind): Promise<string[]> {
  const hit = cache.get(kind);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.names;
  const names = await loadNames(kind);
  cache.set(kind, { at: Date.now(), names });
  return names;
}

// Fuzzy-rank the kind's names against `query` (best first), or return the first `limit` names when
// no query is given.
async function searchNames(kind: LookupKind, query: string | undefined, limit: number): Promise<string[]> {
  const names = await allNames(kind);
  if (!query?.trim()) return names.slice(0, limit);

  const items = names.map(name => ({ name, norm: normalize(name) }));
  const fuse = new Fuse(items, { keys: ["norm"], threshold: 0.4, ignoreLocation: true });
  return fuse
    .search(normalize(query))
    .slice(0, limit)
    .map(r => r.item.name);
}

export const lookupsRepo = { allNames, searchNames };
