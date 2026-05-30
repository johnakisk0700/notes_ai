import { useEffect, useState } from 'react';
import { api } from '@/integrations/api';

// An <img> tag can't carry the Clerk bearer token, so fetch the (authed) chat image via
// the axios `api` instance as a blob and hand back an object URL. Results are cached by
// url in a module-level LRU so scrolling/re-rendering the message list never refetches.
// Object URLs hold a decoded blob alive, so an unbounded cache would grow for the whole
// session — instead we cap the cache and revoke the oldest entry's object URL when we
// evict it (see `cacheObjectUrl`). The cap is well above the images visible at once, so
// the entry being evicted is never the current src of an on-screen <img>.
const MAX_CACHED_IMAGES = 60;
const objectUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// Read the cache and mark the entry most-recently-used (re-insert moves it to the end, so
// the oldest live entry stays at the front for eviction).
function getCachedObjectUrl(url: string): string | undefined {
  const cached = objectUrlCache.get(url);
  if (cached === undefined) return undefined;
  objectUrlCache.delete(url);
  objectUrlCache.set(url, cached);
  return cached;
}

// Insert as most-recently-used, evicting (and revoking) the oldest entry over the cap.
function cacheObjectUrl(url: string, objectUrl: string): void {
  objectUrlCache.set(url, objectUrl);
  while (objectUrlCache.size > MAX_CACHED_IMAGES) {
    const oldest = objectUrlCache.keys().next().value as string | undefined;
    if (oldest === undefined) break;
    const stale = objectUrlCache.get(oldest);
    objectUrlCache.delete(oldest);
    if (stale) URL.revokeObjectURL(stale);
  }
}

// '/api/chat-image/<id>' -> 'chat-image/<id>' so axios joins it onto BASE_URL (.../api/)
// instead of doubling the /api segment.
function toApiPath(url: string): string {
  return url.replace(/^\/?api\//, '');
}

function fetchAuthedImage(url: string): Promise<string> {
  const cached = getCachedObjectUrl(url);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = api
    .get<Blob>(toApiPath(url), { responseType: 'blob' })
    .then(({ data }) => {
      const objectUrl = URL.createObjectURL(data);
      cacheObjectUrl(url, objectUrl);
      return objectUrl;
    })
    .finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p;
}

export function useAuthedImageUrl(url: string | undefined): { src?: string; loading: boolean; error: boolean } {
  const initial = url ? getCachedObjectUrl(url) : undefined;
  const [src, setSrc] = useState<string | undefined>(initial);
  const [loading, setLoading] = useState<boolean>(!!url && !initial);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!url) {
      setSrc(undefined);
      setLoading(false);
      setError(false);
      return;
    }
    const cached = getCachedObjectUrl(url);
    if (cached) {
      setSrc(cached);
      setLoading(false);
      setError(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchAuthedImage(url)
      .then(objectUrl => {
        if (cancelled) return;
        setSrc(objectUrl);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { src, loading, error };
}
