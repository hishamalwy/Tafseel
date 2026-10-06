import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { injectFocusFirstInvalid } from './form-focus';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form>
      <input id="name" [attr.aria-invalid]="attempted() && !name()" />
      <input id="email" [attr.aria-invalid]="attempted()" />
      <button type="submit">Send</button>
    </form>
  `
})
class FormHost {
  readonly attempted = signal(false);
  readonly name = signal('');
  readonly focusFirstInvalid = injectFocusFirstInvalid();
}

function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(FormHost);
  document.body.append(fixture.nativeElement);
  fixture.detectChanges();
  return fixture;
}

/** A refused submit lands keyboard and screen-reader users on the problem, not on the button. */
describe('injectFocusFirstInvalid', () => {
  it('waits for the errors to render, then focuses the first invalid field', async () => {
    const fixture = render();
    fixture.componentInstance.attempted.set(true);
    fixture.componentInstance.focusFirstInvalid();
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('name');
  });

  it('moves focus at once when the errors are already on screen', async () => {
    const fixture = render();
    fixture.componentInstance.attempted.set(true);
    await fixture.whenStable();
    fixture.componentInstance.name.set('Sara');
    await fixture.whenStable();
    (fixture.nativeElement.querySelector('button') as HTMLElement).focus();

    fixture.componentInstance.focusFirstInvalid();

    expect(document.activeElement?.id).toBe('email');
  });
});
