import { useEffect, useState } from 'react';
import { api } from '@/integrations/api';

// An <img> tag can't carry the Clerk bearer token, so fetch the (authed) chat image via
// the axios `api` instance as a blob and hand back an object URL. Results are cached by
// url in a module map so scrolling/re-rendering the message list never refetches; object
// URLs are released when the page unloads (the per-thread set is small and bounded).
const objectUrlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

// '/api/chat-image/<id>' -> 'chat-image/<id>' so axios joins it onto BASE_URL (.../api/)
// instead of doubling the /api segment.
function toApiPath(url: string): string {
  return url.replace(/^\/?api\//, '');
}

function fetchAuthedImage(url: string): Promise<string> {
  const cached = objectUrlCache.get(url);
  if (cached) return Promise.resolve(cached);
  const existing = inflight.get(url);
  if (existing) return existing;

  const p = api
    .get<Blob>(toApiPath(url), { responseType: 'blob' })
    .then(({ data }) => {
      const objectUrl = URL.createObjectURL(data);
      objectUrlCache.set(url, objectUrl);
      return objectUrl;
    })
    .finally(() => inflight.delete(url));

  inflight.set(url, p);
  return p;
}

export function useAuthedImageUrl(url: string | undefined): { src?: string; loading: boolean; error: boolean } {
  const initial = url ? objectUrlCache.get(url) : undefined;
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
    const cached = objectUrlCache.get(url);
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
