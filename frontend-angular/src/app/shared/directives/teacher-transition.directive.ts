import { DOCUMENT } from '@angular/common';
import { DestroyRef, Directive, ElementRef, Injectable, Injector, afterNextRender, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { InteractionMotion } from '@core/a11y/interaction-motion.service';

/** One shared avatar, only on a deliberate pointer navigation to a teacher's profile. */
@Injectable({ providedIn: 'root' })
export class TeacherTransition {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly motion = inject(InteractionMotion);
  readonly teacherId = signal('');
  readonly avatarSrc = signal('');

  start(event: MouseEvent, link: HTMLAnchorElement, id: string): void {
    const avatar = link.closest('article')?.querySelector<HTMLImageElement>('.tf-mk-av');
    if (event.defaultPrevented || event.button !== 0 || event.detail === 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
        link.target === '_blank' || !avatar || !this.motion.allowed() || !this.document.startViewTransition || this.teacherId()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.teacherId.set(id);
    this.avatarSrc.set(avatar.currentSrc || avatar.src);
    avatar.style.viewTransitionName = 'tf-teacher-avatar';
    const transition = this.document.startViewTransition(async () => {
      if (!await this.router.navigateByUrl('/teachers/' + encodeURIComponent(id))) {
        transition.skipTransition();
        return;
      }
      // The existing public avatar is present in the destination skeleton.
      // Capture the next render, never wait for profile/review/API responses.
      await new Promise<void>(resolve => afterNextRender(resolve, { injector: this.injector }));
    });
    void transition.finished.catch(() => {}).finally(() => {
      this.teacherId.set('');
      this.avatarSrc.set('');
      avatar.style.viewTransitionName = '';
    });
  }
}

@Directive({ selector: 'a[tfTeacherTransition]' })
export class TeacherTransitionDirective {
  readonly tfTeacherTransition = input.required<string>();
  private readonly link = inject(ElementRef<HTMLAnchorElement>).nativeElement;
  private readonly transition = inject(TeacherTransition);
  constructor() {
    const click = (event: MouseEvent): void => this.transition.start(event, this.link, this.tfTeacherTransition());
    this.link.addEventListener('click', click, true);
    inject(DestroyRef).onDestroy(() => this.link.removeEventListener('click', click, true));
  }
}
