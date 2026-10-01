import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { HeroRotatorComponent } from './hero-rotator.component';

function create(reducedMotion: boolean) {
  TestBed.configureTestingModule({
    imports: [HeroRotatorComponent],
    providers: [{ provide: ReducedMotion, useValue: { preferred: signal(reducedMotion) } }]
  });
  const fixture = TestBed.createComponent(HeroRotatorComponent);
  fixture.componentRef.setInput('words', ['needs', 'level', 'pace']);
  fixture.componentRef.setInput('intervalMs', 1000);
  let settled = 0;
  fixture.componentInstance.settled.subscribe(() => settled++);
  fixture.detectChanges();
  const current = () => (fixture.nativeElement.querySelector('.tf-rotate-slot-current') as HTMLElement).textContent?.trim();
  const advance = (ms: number) => { vi.advanceTimersByTime(ms); fixture.detectChanges(); };
  return { fixture, current, advance, settled: () => settled };
}

describe('HeroRotatorComponent', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps rotating copy decorative for assistive technology', () => {
    const { fixture } = create(true);
    expect(fixture.nativeElement.querySelector('.tf-rotate-word')?.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('[aria-live]')).toBeNull();
    fixture.destroy();
  });

  it('rolls through the words once, rests on the first, and says it has settled', () => {
    const { fixture, current, advance, settled } = create(false);
    expect(current()).toBe('needs');
    advance(1000); expect(current()).toBe('level');
    advance(1000); expect(current()).toBe('pace');
    advance(1000); expect(current()).toBe('needs');
    expect(settled()).toBe(1);

    advance(10_000);
    expect(current()).toBe('needs');
    expect(settled()).toBe(1);
    fixture.destroy();
  });

  it('never moves under reduced motion', () => {
    const { fixture, current, advance } = create(true);
    advance(10_000);
    expect(current()).toBe('needs');
    fixture.destroy();
  });
});
