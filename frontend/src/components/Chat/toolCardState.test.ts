import { describe, expect, it } from 'vitest';
import { toolCallVisualState } from './toolCardState';

describe('toolCallVisualState', () => {
  it('spins while the turn is live and no result has arrived', () => {
    expect(toolCallVisualState({ state: 'input-available', output: undefined, settled: false })).toBe('running');
    expect(toolCallVisualState({ state: 'input-streaming', output: undefined, settled: false })).toBe('running');
  });

  it('is done once the output arrives', () => {
    expect(toolCallVisualState({ state: 'output-available', output: { count: 3 }, settled: false })).toBe('done');
  });

  // The reported bug: a tool returned a result and the model answered, but the live overlay left
  // the chip at input-available and the reconcile race preserved it — it must NOT stay spinning.
  it('never spins once the turn has settled, even if the part is stuck at input-available', () => {
    expect(toolCallVisualState({ state: 'input-available', output: undefined, settled: true })).toBe('done');
    expect(toolCallVisualState({ state: undefined, output: undefined, settled: true })).toBe('done');
  });

  it('treats a hard tool error (output-error) as error', () => {
    expect(toolCallVisualState({ state: 'output-error', output: undefined, settled: true })).toBe('error');
  });

  it('treats a self-reported web-tool failure ({ ok:false }) as error', () => {
    expect(
      toolCallVisualState({ state: 'output-available', output: { ok: false, error: 'HTTP 500' }, settled: false })
    ).toBe('error');
  });

  it('treats a successful web fetch ({ ok:true }) as done', () => {
    expect(toolCallVisualState({ state: 'output-available', output: { ok: true, text: '…' }, settled: false })).toBe(
      'done'
    );
  });
});
