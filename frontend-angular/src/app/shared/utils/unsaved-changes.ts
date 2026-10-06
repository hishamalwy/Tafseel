import { DOCUMENT } from '@angular/common';
import { DestroyRef, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { LocaleService } from '@core/i18n/locale.service';
import { DialogService } from '@shared/services/dialog.service';

/** Warn on leave without persisting passwords, financial data or form contents. */
export function injectUnsavedChanges(isDirty: () => boolean) {
  const view = inject(DOCUMENT).defaultView;
  const dialogs = inject(DialogService);
  const locale = inject(LocaleService);
  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  };
  view?.addEventListener('beforeunload', beforeUnload);
  inject(DestroyRef).onDestroy(() => view?.removeEventListener('beforeunload', beforeUnload));
  let pending: Promise<boolean> | null = null;
  return {
    isDirty,
    canLeave: (): Promise<boolean> => {
      if (!isDirty()) return Promise.resolve(true);
      if (!pending) pending = dialogs.confirm({
        title: locale.t('craft_unsaved_title', 'Leave without saving?'),
        body: locale.t('craft_unsaved_body', 'Your changes have not been saved. Leaving this page will discard them.'),
        confirmLabel: locale.t('craft_unsaved_leave', 'Leave without saving'),
        cancelLabel: locale.t('craft_unsaved_stay', 'Keep editing'),
        destructive: true
      }).finally(() => { pending = null; });
      return pending;
    }
  };
}

export const unsavedChangesGuard: CanDeactivateFn<{ unsavedChanges: ReturnType<typeof injectUnsavedChanges> }> =
  component => component.unsavedChanges.canLeave();
