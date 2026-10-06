import { TestBed } from '@angular/core/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LocaleService } from '@core/i18n/locale.service';
import { FilePickerComponent } from './file-picker.component';

const NativeURL = URL;
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

describe('local attachment previews', () => {
  it('reuses retained previews, revokes removed ones, and releases the last preview on destroy', async () => {
    const create = vi.fn().mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second');
    const revoke = vi.fn();
    class PreviewURL extends NativeURL {
      static override createObjectURL = create;
      static override revokeObjectURL = revoke;
    }
    vi.stubGlobal('URL', PreviewURL);
    TestBed.configureTestingModule({ providers: [{ provide: LocaleService, useValue: { t: (_: string, fallback: string) => fallback } }] });
    const fixture = TestBed.createComponent(FilePickerComponent);
    const first = new File(['a'], 'first.png', { type: 'image/png' });
    const second = new File(['b'], 'second.jpg', { type: 'image/jpeg' });
    const document = new File(['c'], 'notes.pdf', { type: 'application/pdf' });
    fixture.componentRef.setInput('title', 'Attach');
    fixture.componentRef.setInput('files', [first, second, document]);
    await fixture.whenStable();
    expect(create).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.querySelectorAll('img')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('PDF');
    fixture.componentRef.setInput('files', [second, document]);
    await fixture.whenStable();
    expect(create).toHaveBeenCalledTimes(2);
    expect(revoke).toHaveBeenCalledWith('blob:first');
    expect(revoke).not.toHaveBeenCalledWith('blob:second');
    fixture.destroy();
    expect(revoke).toHaveBeenCalledWith('blob:second');
  });
});
