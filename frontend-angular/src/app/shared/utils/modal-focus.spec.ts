// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { containModalFocus } from './modal-focus';

describe('containModalFocus', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('wraps Tab, closes with Escape, and restores the opener', () => {
    const opener = document.createElement('button');
    const panel = document.createElement('div');
    panel.tabIndex = -1;
    const first = document.createElement('button');
    const last = document.createElement('button');
    panel.append(first, last);
    document.body.append(opener, panel);
    vi.spyOn(first, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
    vi.spyOn(last, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
    opener.focus();
    const close = vi.fn();
    const release = containModalFocus(panel, document, close);

    expect(document.activeElement).toBe(panel);
    last.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(first);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(close).toHaveBeenCalledOnce();
    release();
    expect(document.activeElement).toBe(opener);
  });
});
