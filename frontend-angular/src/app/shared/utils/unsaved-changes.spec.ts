import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleService } from '@core/i18n/locale.service';
import { DialogService } from '@shared/services/dialog.service';
import { injectUnsavedChanges } from './unsaved-changes';

afterEach(() => TestBed.resetTestingModule());

describe('unsaved edits protection', () => {
  function setup(confirm = vi.fn().mockResolvedValue(false)) {
    let dirty = false;
    TestBed.configureTestingModule({providers: [
      {provide: DialogService, useValue: {confirm}},
      {provide: LocaleService, useValue: {t: (_key: string, fallback: string) => fallback}}
    ]});
    const protection = TestBed.runInInjectionContext(() => injectUnsavedChanges(() => dirty));
    return {protection, confirm, edit: () => {dirty = true;}, saved: () => {dirty = false;}};
  }

  it('allows clean and successfully saved forms to leave without a prompt', async () => {
    const s = setup();
    expect(await s.protection.canLeave()).toBe(true);
    s.edit(); s.saved();
    expect(await s.protection.canLeave()).toBe(true);
    expect(s.confirm).not.toHaveBeenCalled();
  });

  it('keeps dirty edits on cancellation and allows explicit discard', async () => {
    const s = setup(vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true));
    s.edit();
    expect(await s.protection.canLeave()).toBe(false);
    expect(s.protection.isDirty()).toBe(true);
    expect(await s.protection.canLeave()).toBe(true);
  });

  it('shares a pending confirmation across repeated navigation attempts', async () => {
    let resolve!: (value: boolean) => void;
    const s = setup(vi.fn(() => new Promise<boolean>(r => {resolve = r;})));
    s.edit();
    const first = s.protection.canLeave(), second = s.protection.canLeave();
    expect(first).toBe(second);
    expect(s.confirm).toHaveBeenCalledTimes(1);
    resolve(false);
    expect(await first).toBe(false);
  });

  it('warns on document unload only while dirty', () => {
    const s = setup();
    const clean = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    s.edit();
    const dirty = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });
});
