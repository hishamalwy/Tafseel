import { TestBed } from '@angular/core/testing';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { ProtectedFile } from '@core/http/protected-file.service';
import { LocaleService } from '@core/i18n/locale.service';
import { ProtectedFileViewerComponent } from './protected-file-viewer.component';

describe('ProtectedFileViewerComponent', () => {
  it('renders a protected PDF without exposing a download control', async () => {
    const revoke = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ProtectedFileViewerComponent],
      providers: [
        { provide: ProtectedFile, useValue: { objectUrl: async () => ({ url: 'blob:test', contentType: 'application/pdf', revoke }) } },
        { provide: SESSION_STORE, useValue: { current: () => ({ email: 'student@example.com' }) } },
        { provide: LocaleService, useValue: { t: (_key: string, fallback: string) => fallback } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(ProtectedFileViewerComponent);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    dialog.showModal = vi.fn();
    dialog.close = vi.fn();

    await fixture.componentInstance.open('/protected/file', 'lesson.pdf', 'application/pdf');
    fixture.detectChanges();

    expect(dialog.showModal).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('iframe')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[download]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('student@example.com');
    fixture.componentInstance.close();
    expect(revoke).toHaveBeenCalledOnce();
  });
});
