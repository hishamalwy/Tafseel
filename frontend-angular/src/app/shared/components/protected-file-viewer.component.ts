import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { ProtectedFile, ProtectedObjectUrl } from '@core/http/protected-file.service';
import { LocaleService } from '@core/i18n/locale.service';

type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'unsupported';

@Component({
  selector: 'tf-protected-file-viewer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './protected-file-viewer.component.html',
  styles: ':host{display:contents}'
})
export class ProtectedFileViewerComponent implements OnDestroy {
  @ViewChild('dialog', { static: true }) private readonly dialog?: ElementRef<HTMLDialogElement>;
  private readonly files = inject(ProtectedFile);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly session = inject(SESSION_STORE);
  private readonly locale = inject(LocaleService);
  private object: ProtectedObjectUrl | null = null;
  private request = 0;

  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly fileName = signal('');
  readonly url = signal('');
  readonly frameUrl = signal<SafeResourceUrl | null>(null);
  readonly kind = signal<PreviewKind>('unsupported');
  readonly watermark = this.session.current()?.email || this.session.current()?.fullName || 'Tafseel';

  async open(path: string, fileName: string, declaredType = ''): Promise<void> {
    const request = ++this.request;
    this.release();
    this.fileName.set(fileName);
    this.kind.set(this.mediaKind(declaredType, fileName));
    this.loading.set(true);
    this.failed.set(false);
    this.dialog?.nativeElement.showModal();
    try {
      const object = await this.files.objectUrl(path);
      if (request !== this.request) { object?.revoke(); return; }
      if (!object) throw new Error('missing-file');
      this.object = object;
      this.kind.set(this.mediaKind(object.contentType || declaredType, fileName));
      this.url.set(object.url);
      if (this.kind() === 'pdf') {
        this.frameUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(
          `${object.url}#toolbar=0&navpanes=0&statusbar=0&messages=0`
        ));
      }
    } catch {
      if (request === this.request) this.failed.set(true);
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  close(): void {
    this.request++;
    this.dialog?.nativeElement.close();
    this.release();
  }

  backdrop(event: MouseEvent): void {
    if (event.target === this.dialog?.nativeElement) this.close();
  }

  prevent(event: Event): void { event.preventDefault(); }
  t(key: string, fallback: string): string { return this.locale.t(key, fallback); }
  ngOnDestroy(): void { this.release(); }

  private release(): void {
    this.object?.revoke();
    this.object = null;
    this.url.set('');
    this.frameUrl.set(null);
  }

  private mediaKind(contentType: string, fileName: string): PreviewKind {
    const type = contentType.toLowerCase();
    if (type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName)) return 'image';
    if (type.startsWith('video/') || /\.(mp4|webm)$/i.test(fileName)) return 'video';
    if (type.startsWith('audio/') || /\.(wav|mp3|m4a|aac|ogg)$/i.test(fileName)) return 'audio';
    if (type === 'application/pdf' || /\.pdf$/i.test(fileName)) return 'pdf';
    return 'unsupported';
  }
}
