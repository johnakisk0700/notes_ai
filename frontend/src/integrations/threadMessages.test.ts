import { describe, expect, it } from 'vitest';
import { deriveThreadTitle, mergeThreadNoRegress, optimisticThread, toUIMessage } from './threadMessages';
import type { ThreadDetail, ThreadMessageDTO, ThreadMessageStatus } from '@shared';
import type { UIMessage } from 'ai';

describe('toUIMessage', () => {
  it('falls back to a single text part for plain user content', () => {
    const dto: ThreadMessageDTO = { id: 'u1', role: 'user', content: 'hi', timestamp: 't' };
    const m = toUIMessage(dto);
    expect(m.id).toBe('u1');
    expect(m.role).toBe('user');
    expect(m.parts).toEqual([{ type: 'text', text: 'hi' }]);
  });

  it('keeps assistant parts and folds status into metadata', () => {
    const dto: ThreadMessageDTO = {
      id: 'g1',
      role: 'assistant',
      content: 'ans',
      parts: [{ type: 'text', text: 'ans' }],
      metadata: { model: 'qwen' },
      status: 'streaming',
      timestamp: 't',
    };
    const m = toUIMessage(dto);
    expect(m.parts).toEqual([{ type: 'text', text: 'ans' }]);
    expect(m.metadata).toEqual({ model: 'qwen', status: 'streaming' });
  });

  it('leaves metadata untouched when there is no status', () => {
    const dto: ThreadMessageDTO = {
      id: 'g1',
      role: 'assistant',
      content: 'x',
      metadata: { model: 'q' },
      timestamp: 't',
    };
    expect(toUIMessage(dto).metadata).toEqual({ model: 'q' });
  });
});

describe('optimisticThread', () => {
  const live = [
    { id: 'u-client', role: 'user', parts: [{ type: 'text', text: 'q' }] },
    {
      id: 'a-client',
      role: 'assistant',
      parts: [{ type: 'text', text: 'a' }],
      metadata: { model: 'qwen', costEur: 0.01 },
    },
  ] as unknown as UIMessage[];

  it('stamps the finished assistant with the generationId + terminal status', () => {
    const t = optimisticThread('thr', live, 'a-client', 'gen-1', 'complete', undefined);
    const assistant = t.messages[1];
    expect(assistant.id).toBe('gen-1'); // correlates with the persisted placeholder
    expect(assistant.status).toBe('complete');
    expect(assistant.metadata).toEqual({ model: 'qwen', costEur: 0.01 });
    expect(t.messages[0].id).toBe('u-client'); // user keeps its id, no status
    expect(t.messages[0].status).toBeUndefined();
  });

  it('carries title/inserted_at from previous when known (Mongo-down keeps the answer)', () => {
    const prev: ThreadDetail = { id: 'thr', title: 'Existing', inserted_at: 'iso', messages: [] };
    const t = optimisticThread('thr', live, 'a-client', 'gen-1', 'error', prev);
    expect(t.title).toBe('Existing');
    expect(t.inserted_at).toBe('iso');
    expect(t.messages[1].status).toBe('error');
  });

  it('derives a title from the first user message for a brand-new thread', () => {
    expect(optimisticThread('thr', live, 'a-client', 'gen-1', 'complete', undefined).title).toBe('q');
  });
});

describe('deriveThreadTitle', () => {
  it('returns "New chat" when there is no user text', () => {
    expect(deriveThreadTitle([])).toBe('New chat');
  });

  it('truncates an overlong title with an ellipsis', () => {
    const msgs = [{ id: 'u', role: 'user', parts: [{ type: 'text', text: 'x'.repeat(80) }] }] as unknown as UIMessage[];
    expect(deriveThreadTitle(msgs).endsWith('…')).toBe(true);
  });
});

describe('mergeThreadNoRegress', () => {
  const thread = (lastStatus: ThreadMessageStatus, content = 'ans', id = 'gen-1'): ThreadDetail => ({
    id: 'thr',
    title: 't',
    inserted_at: 'iso',
    messages: [
      { id: 'u1', role: 'user', content: 'q', timestamp: 't' },
      { id, role: 'assistant', content, status: lastStatus, timestamp: 't' },
    ],
  });

  it('keeps a finalized turn when a late poll re-reports it as streaming (anti-flicker)', () => {
    const cached = thread('complete', 'final answer');
    const stalePoll = thread('streaming', ''); // same generationId, regressed to streaming
    const merged = mergeThreadNoRegress(cached, stalePoll);
    expect(merged.messages[1].status).toBe('complete');
    expect(merged.messages[1].content).toBe('final answer');
  });

  it('also protects a finalized "error" turn from regressing to streaming', () => {
    const merged = mergeThreadNoRegress(thread('error'), thread('streaming', ''));
    expect(merged.messages[1].status).toBe('error');
  });

  it('passes a forward streaming→complete transition straight through', () => {
    const merged = mergeThreadNoRegress(thread('streaming', ''), thread('complete', 'done'));
    expect(merged.messages[1].status).toBe('complete');
    expect(merged.messages[1].content).toBe('done');
  });

  it('does not block a genuinely new turn (different generationId)', () => {
    const cached = thread('complete', 'first', 'gen-1');
    const withNewTurn: ThreadDetail = {
      ...cached,
      messages: [
        ...cached.messages,
        { id: 'gen-2', role: 'assistant', content: '', status: 'streaming', timestamp: 't' },
      ],
    };
    const merged = mergeThreadNoRegress(cached, withNewTurn);
    expect(merged.messages).toHaveLength(3);
    expect(merged.messages[2].status).toBe('streaming');
  });

  it('returns fresh when there is no cache', () => {
    expect(mergeThreadNoRegress(undefined, thread('streaming', ''))).toEqual(thread('streaming', ''));
  });
});
