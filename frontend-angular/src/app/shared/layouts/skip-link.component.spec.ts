import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { SkipLinkComponent } from './skip-link.component';

@Component({
  imports: [SkipLinkComponent],
  template: `<tf-skip-link target="main-content" /><nav><a href="/x">One</a></nav><main id="main-content">Content</main>`
})
class HostComponent {}

describe('SkipLinkComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    const link = fixture.nativeElement.querySelector('a.tf-skip') as HTMLAnchorElement;
    const main = fixture.nativeElement.querySelector('main') as HTMLElement;
    return { fixture, link, main };
  }

  it('moves focus to its target main instead of following the #fragment against <base href>', () => {
    const { fixture, link, main } = render();
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(main);
    expect(main.getAttribute('tabindex')).toBe('-1');
    fixture.nativeElement.remove();
  });

  it('points at the main it skips to and is the first link on the screen', () => {
    const { fixture, link } = render();
    expect(link.getAttribute('href')).toBe('#main-content');
    expect(fixture.nativeElement.querySelector('a')).toBe(link);
    fixture.nativeElement.remove();
  });
});
