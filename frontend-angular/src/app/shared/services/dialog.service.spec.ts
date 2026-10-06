import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { InteractionMotion } from '@core/a11y/interaction-motion.service';
import { LocaleService } from '@core/i18n/locale.service';
import { DialogService } from './dialog.service';

afterEach(() => { document.querySelectorAll('dialog, [data-dialog-trigger]').forEach(node => node.remove()); TestBed.resetTestingModule(); vi.restoreAllMocks(); delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)['showModal']; });

function open(animate: boolean, destructive = false) {
  TestBed.configureTestingModule({ providers: [
    { provide: InteractionMotion, useValue: { allowed: signal(animate) } },
    { provide: LocaleService, useValue: { t: (_: string, fallback: string) => fallback } }
  ] });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function (this: HTMLDialogElement) { this.setAttribute('open', ''); } });
  const trigger = document.createElement('button'); trigger.dataset['dialogTrigger'] = ''; document.body.append(trigger); trigger.focus();
  const result = TestBed.inject(DialogService).confirm({ title:'Confirm delivery', body: 'Accept this delivery?', destructive });
  const dialog = document.querySelector('dialog')!;
  return { trigger, dialog, result };
}

describe('native confirmation lifecycle', () => {
  it('links a real name and description and initially focuses cancellation for destructive actions', async () => {
    const {dialog,result}=open(false,true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Confirm delivery');
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('Accept this delivery?');
    expect((document.activeElement as HTMLButtonElement).value).toBe('cancel');
    dialog.dispatchEvent(new Event('cancel',{cancelable:true}));expect(await result).toBe(false);
  });
  it('keeps the modal during a pointer exit and then restores focus and resolves just once', async () => {
    const { trigger, dialog, result } = open(true);
    dialog.querySelector<HTMLButtonElement>('button[value="confirm"]')!.click();
    expect(dialog.isConnected).toBe(true);
    expect(dialog.inert).toBe(true);
    expect(dialog.classList.contains('is-leaving')).toBe(true);
    expect(await result).toBe(true);
    expect(dialog.isConnected).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('dismisses immediately for keyboard/reduced motion without committing the action', async () => {
    const { trigger, dialog, result } = open(false);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(dialog.isConnected).toBe(false);
    expect(await result).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });
});
