import { InteractionMotion } from '@core/a11y/interaction-motion.service';
import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { LocaleService } from '@core/i18n/locale.service';

export interface ConfirmOptions {
  readonly title?: string;
  readonly body: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  readonly destructive?: boolean;
}

export interface ChoiceOptions {
  readonly title?: string;
  readonly message: string;
  readonly acceptLabel?: string;
  readonly declineLabel?: string;
}

export interface PromptOptions {
  readonly title?: string;
  readonly message: string;
  readonly defaultValue?: string;
  readonly confirmLabel?: string;
  readonly cancelLabel?: string;
}

/**
 * Modal confirm / choice / prompt, ported from `Tafseel.confirm`, `choice`,
 * `prompt` and `confirmAction`.
 *
 * Built on the native `<dialog>` element, as the legacy version was, because it
 * brings the focus trap, the top layer and Escape handling with it — which is
 * why `Tafseel.modalKeyDown` (a hand-written 20-line trap) is not ported: it
 * existed for the non-`<dialog>` modals, and `showModal()` already does it.
 *
 * The one thing carefully preserved is focus restoration: the element that was
 * focused before the dialog opened gets focus back when it closes, so keyboard
 * users are not dropped at the top of the document.
 */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly document = inject(DOCUMENT);
  private readonly locale = inject(LocaleService);
  private readonly motion = inject(InteractionMotion);
  private dialogCount = 0;

  /** Resolves true when confirmed, false when cancelled or dismissed. */
  async confirm(options: ConfirmOptions): Promise<boolean> {
    const result = await this.open(dialog => {
      dialog.append(
        this.head(options.title ?? this.t('confirm_action', 'Confirm action')),
        this.body(options.body),
        this.actions([
          { value: 'cancel', label: options.cancelLabel ?? this.t('cancel', 'Cancel'), variant: 'secondary', autofocus: !!options.destructive },
          {
            value: 'confirm',
            label: options.confirmLabel ?? this.t('confirm', 'Confirm'),
            variant: options.destructive ? 'danger' : 'primary',
            autofocus: !options.destructive
          }
        ])
      );
    });
    return result === 'confirm';
  }

  /**
   * Three outcomes, not two: accept, decline, or dismissed. Used where declining
   * is a real decision and closing the dialog is not the same as declining.
   */
  async choice(options: ChoiceOptions): Promise<boolean | null> {
    const result = await this.open(dialog => {
      dialog.append(
        this.head(options.title ?? this.t('choose_action', 'Choose an action')),
        this.body(options.message),
        this.actions([
          { value: 'decline', label: options.declineLabel ?? this.t('decline', 'Decline'), variant: 'secondary' },
          { value: 'accept', label: options.acceptLabel ?? this.t('accept', 'Accept'), variant: 'primary', autofocus: true }
        ])
      );
    });
    if (result === 'accept') return true;
    if (result === 'decline') return false;
    return null;
  }

  /** Resolves the entered text, or null when cancelled. */
  async prompt(options: PromptOptions): Promise<string | null> {
    let input!: HTMLInputElement;
    const result = await this.open(dialog => {
      input = this.document.createElement('input');
      input.type = 'text';
      input.className = 'tf-system-dialog-input';
      input.value = options.defaultValue ?? '';
      input.id = 'tf-system-dialog-input';

      const label = this.document.createElement('label');
      label.htmlFor = input.id;
      label.textContent = options.message;

      const field = this.document.createElement('div');
      field.className = 'tf-system-dialog-field';
      field.append(label, input);

      dialog.append(
        this.head(options.title ?? this.t('enter_value', 'Enter a value')),
        field,
        this.actions([
          { value: 'cancel', label: options.cancelLabel ?? this.t('cancel', 'Cancel'), variant: 'secondary' },
          { value: 'confirm', label: options.confirmLabel ?? this.t('confirm', 'Confirm'), variant: 'primary' }
        ])
      );
      queueMicrotask(() => { input.focus(); input.select(); });
    });
    return result === 'confirm' ? input.value : null;
  }

  /**
   * Shared plumbing: build, show modally, restore focus, and always clean up.
   * Returns the button value, or null when dismissed with Escape.
   */
  private open(build: (dialog: HTMLDialogElement) => void): Promise<string | null> {
    return new Promise(resolve => {
      const previouslyFocused = this.document.activeElement as HTMLElement | null;

      const dialog = this.document.createElement('dialog');
      dialog.className = 'tf-system-dialog';

      const form = this.document.createElement('form');
      form.method = 'dialog';
      build(form as unknown as HTMLDialogElement);
      const heading = form.querySelector('h2');
      if (heading) {
        heading.id = `tf-system-dialog-title-${++this.dialogCount}`;
        dialog.setAttribute('aria-labelledby', heading.id);
      }
      const description = form.querySelector('p');
      if (description && heading) {
        description.id = `${heading.id}-description`;
        dialog.setAttribute('aria-describedby', description.id);
      }
      dialog.append(form);
      this.document.body.append(dialog);

      let settled = false;
      const finish = (value: string | null): void => {
        if (settled) return;
        settled = true;
        const cleanUp = (): void => {
          dialog.remove();
          previouslyFocused?.focus?.();
          resolve(value);
        };
        if (!this.motion.allowed() || !dialog.open) { cleanUp(); return; }
        dialog.inert = true;
        dialog.classList.add('is-leaving');
        const duration = parseFloat(this.document.defaultView?.getComputedStyle(dialog).getPropertyValue('--motion-overlay-exit') ?? '') || 160;
        const timer = setTimeout(cleanUp, duration + 60);
        dialog.addEventListener('animationend', event => {
          if (event.target !== dialog || event.animationName !== 'tf-craft-leave') return;
          clearTimeout(timer); cleanUp();
        }, { once: true });
      };

      // Escape fires `cancel`; preventing the default keeps close handling in
      // one place instead of two.
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(null); });
      dialog.addEventListener('close', () => finish(dialog.returnValue || null));
      form.addEventListener('submit', event => {
        event.preventDefault();
        finish((event.submitter as HTMLButtonElement | null)?.value || null);
      });

      dialog.showModal();
      dialog.querySelector<HTMLElement>('[autofocus]')?.focus();
    });
  }

  private head(title: string): HTMLElement {
    const head = this.document.createElement('div');
    head.className = 'tf-system-dialog-head';
    const heading = this.document.createElement('h2');
    heading.textContent = title;
    head.append(heading);
    return head;
  }

  private body(text: string): HTMLElement {
    const paragraph = this.document.createElement('p');
    // textContent, not innerHTML: this reaches the DOM with server strings in it.
    paragraph.textContent = text;
    return paragraph;
  }

  private actions(
    buttons: readonly {
      value: string; label: string;
      variant: 'primary' | 'secondary' | 'danger'; autofocus?: boolean;
    }[]
  ): HTMLElement {
    const row = this.document.createElement('div');
    row.className = 'tf-system-dialog-actions';
    for (const spec of buttons) {
      const button = this.document.createElement('button');
      button.value = spec.value;
      button.textContent = spec.label;
      button.className = spec.variant === 'primary' ? 'tf-button'
        : spec.variant === 'danger' ? 'tf-button tf-button-danger'
        : 'tf-button tf-button-secondary';
      if (spec.autofocus) button.setAttribute('autofocus', '');
      row.append(button);
    }
    return row;
  }

  private t(key: string, fallback: string): string {
    return this.locale.t(key, fallback);
  }
}
