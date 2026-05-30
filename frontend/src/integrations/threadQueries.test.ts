import { describe, expect, it } from 'vitest';
import { latestAssistantStatus, mintObjectId } from './threadQueries';
import type { ThreadDetail } from '@shared';

const thread = (messages: ThreadDetail['messages']): ThreadDetail => ({
  id: 't',
  title: '',
  inserted_at: '',
  messages,
});

describe('latestAssistantStatus', () => {
  it('is undefined when there is no thread (query not loaded)', () => {
    expect(latestAssistantStatus(undefined)).toBeUndefined();
  });

  it('is undefined when the last message is the user (nothing to poll)', () => {
    expect(latestAssistantStatus(thread([{ id: 'u', role: 'user', content: 'q', timestamp: 't' }]))).toBeUndefined();
  });

  it('reflects the latest assistant status (drives the poll)', () => {
    const detail = thread([
      { id: 'u', role: 'user', content: 'q', timestamp: 't' },
      { id: 'g', role: 'assistant', content: '', status: 'streaming', timestamp: 't' },
    ]);
    expect(latestAssistantStatus(detail)).toBe('streaming');
  });

  it('returns complete/error so the poll stops', () => {
    const detail = thread([{ id: 'g', role: 'assistant', content: 'done', status: 'complete', timestamp: 't' }]);
    expect(latestAssistantStatus(detail)).toBe('complete');
  });
});

describe('mintObjectId', () => {
  it('produces a 24-char lowercase hex id (ObjectId-compatible)', () => {
    expect(mintObjectId()).toMatch(/^[a-f0-9]{24}$/);
  });

  it('is unique across calls', () => {
    expect(mintObjectId()).not.toBe(mintObjectId());
  });
});
