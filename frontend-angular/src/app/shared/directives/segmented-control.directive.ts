import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** A single selection plane follows existing aria state, including RTL and resized labels. */
@Directive({ selector: '[tfSegmented]' })
export class SegmentedControlDirective {
  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      const host = this.host;
      const marker = this.document.createElement('span');
      marker.className = 'tf-segment-indicator';
      marker.setAttribute('aria-hidden', 'true');
      host.prepend(marker);
      host.classList.add('tf-segmented');
      const position = (): void => {
        const selected = host.querySelector<HTMLElement>('[aria-pressed="true"], [aria-selected="true"]');
        if (!selected) { marker.hidden = true; return; }
        const parent = host.getBoundingClientRect(), child = selected.getBoundingClientRect();
        const rtl = this.document.defaultView?.getComputedStyle(host).direction === 'rtl';
        const x = rtl ? child.right - parent.right + host.clientLeft + host.scrollLeft
          : child.left - parent.left - host.clientLeft + host.scrollLeft;
        marker.hidden = false;
        marker.style.inlineSize = `${child.width}px`;
        marker.style.blockSize = `${child.height}px`;
        marker.style.transform = `translate(${x}px, ${child.top - parent.top - host.clientTop + host.scrollTop}px)`;
      };
      const mutations = new MutationObserver(position);
      mutations.observe(host, { subtree: true, attributes: true, attributeFilter: ['aria-pressed', 'aria-selected'], childList: true });
      const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(position) : null;
      resize?.observe(host);
      host.addEventListener('scroll', position, { passive: true });
      position();
      this.destroyRef.onDestroy(() => {
        mutations.disconnect(); resize?.disconnect(); host.removeEventListener('scroll', position);
      });
    });
  }
}
