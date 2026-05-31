// Fetches a web page for the chat's fetch_page tool and returns it as readable text. Free, no key.
// Because the MODEL picks the URL, this guards against SSRF: only http/https, and private /
// loopback / link-local hosts are refused so it can't reach the internal qdrant/redis/mongo/postgres
// or cloud metadata. Bounded by a timeout + a response-size cap, and the extracted text is truncated
// to a model budget. Never throws — returns { ok:false } on any problem.
import { convert } from "html-to-text";
import { logger } from "utils/logger";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000; // cap the download so a huge page can't blow memory
const MAX_TEXT_CHARS = 8_000; // cap what the model reads

export interface FetchedPage {
  ok: true;
  url: string;
  title?: string;
  text: string;
}
export interface FetchError {
  ok: false;
  url: string;
  error: string;
}

export async function fetchPage(
  rawUrl: string,
  opts: { signal?: AbortSignal } = {}
): Promise<FetchedPage | FetchError> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, url: rawUrl, error: "Invalid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, url: rawUrl, error: "Only http(s) URLs are allowed." };
  }
  if (isBlockedHost(url.hostname)) {
    return { ok: false, url: rawUrl, error: "Refusing to fetch a private/loopback address." };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (compatible; MnemeBot/1.0; +https://mneme.narusec.io)" },
    });
    if (!res.ok) return { ok: false, url: rawUrl, error: `HTTP ${res.status}` };
    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      return { ok: false, url: rawUrl, error: `Unsupported content type: ${contentType || "unknown"}` };
    }
    const html = await readCapped(res, MAX_BYTES);
    const text = convert(html, {
      wordwrap: false,
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        { selector: "img", format: "skip" },
        { selector: "nav", format: "skip" },
        { selector: "footer", format: "skip" },
      ],
    }).trim();
    return { ok: true, url: res.url || rawUrl, title: titleFrom(html), text: clip(text, MAX_TEXT_CHARS) };
  } catch (err) {
    logger.error(`fetch_page failed for ${rawUrl}:`, err);
    return { ok: false, url: rawUrl, error: err instanceof Error ? err.message : "Fetch failed." };
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

// Block addresses that point back inside our own network. Hostname/IP-literal based — adequate for
// a single-tenant personal app (no DNS-rebinding defense); revisit if that ever changes.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // IPv6 loopback / link-local (fe80::/10) / unique-local (fc00::/7)
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

// Stream the body and stop at the byte cap so a huge page can't exhaust memory.
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.length;
    if (total >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8").decode(merged);
}

function titleFrom(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m ? m[1].trim() : undefined;
}

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}
