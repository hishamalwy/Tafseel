const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keep keyboard focus inside a modal and restore it to the opener on close. */
export function containModalFocus(panel: HTMLElement, document: Document, close: () => void): () => void {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  panel.focus();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(item => item.getClientRects().length);
    if (!items.length) {
      event.preventDefault();
      panel.focus();
      return;
    }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const onFocus = (event: FocusEvent) => {
    if (event.target instanceof Node && !panel.contains(event.target)) panel.focus();
  };
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('focusin', onFocus);
  return () => {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('focusin', onFocus);
    if (opener?.isConnected) opener.focus();
  };
}
