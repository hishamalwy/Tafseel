import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReducedMotion } from '@core/a11y/reduced-motion.service';
import { HeroRotatorComponent } from './hero-rotator.component';

describe('HeroRotatorComponent', () => {
  it('keeps rotating copy decorative for assistive technology', async () => {
    await TestBed.configureTestingModule({
      imports: [HeroRotatorComponent],
      providers: [{ provide: ReducedMotion, useValue: { preferred: signal(true) } }]
    }).compileComponents();

    const fixture = TestBed.createComponent(HeroRotatorComponent);
    fixture.componentRef.setInput('words', ['pace', 'level']);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.tf-rotate-word')?.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('[aria-live]')).toBeNull();
    fixture.destroy();
  });
});
