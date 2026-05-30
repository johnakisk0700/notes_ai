import { beforeEach, describe, expect, it } from 'vitest';
import { __resetNoteCardCaches, resolveOutput } from './notePreviewCache';

// Regression guard for the edit card that "flashed once then stuck on loading": the card
// keys its spinner on the absence of output, so output must never vanish once seen.
describe('resolveOutput', () => {
  beforeEach(() => __resetNoteCardCaches());

  it('returns the live output and remembers it by toolCallId', () => {
    expect(resolveOutput({ toolCallId: 'a', output: { found: true } })).toEqual({ found: true });
  });

  it('falls back to the last seen output when a later render drops it (no flash-to-spinner)', () => {
    resolveOutput({ toolCallId: 'a', output: { before: 'x', after: 'y' } });
    // A later re-render delivers the same part with output momentarily gone:
    expect(resolveOutput({ toolCallId: 'a', output: undefined })).toEqual({ before: 'x', after: 'y' });
  });

  it('keeps caches separate per toolCallId', () => {
    resolveOutput({ toolCallId: 'a', output: { v: 1 } });
    expect(resolveOutput({ toolCallId: 'b', output: undefined })).toBeUndefined();
  });

  it('returns live output without caching when there is no toolCallId', () => {
    expect(resolveOutput({ output: { v: 1 } })).toEqual({ v: 1 });
    expect(resolveOutput({ output: undefined })).toBeUndefined();
  });
});
