// Strip editor-only markup from note text before it's embedded, reranked, or shown to the
// model. TipTap (with the Markdown extension) serializes @-mentions into the persisted
// Markdown as `[@ id="Name"]`; that wrapper is noise for the embedder/reranker (and ugly in
// snippets), so collapse it to the mentioned name. Real Markdown (bold, lists, code) is left
// intact — only the mention token is rewritten.
const MENTION = /\[@[^\]]*\bid="([^"]*)"[^\]]*\]/g;

export function cleanNoteText(text: string): string {
  return text.replace(MENTION, "$1");
}
