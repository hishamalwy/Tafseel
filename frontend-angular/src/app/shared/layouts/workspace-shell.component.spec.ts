import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { WorkspaceShellComponent } from './workspace-shell.component';

/** The phone drawer is laid over the page, so it must close the way anything laid over a page does. */
describe('WorkspaceShellComponent', () => {
  it('closes the open drawer on Escape and gives focus back to its toggle', async () => {
    await TestBed.configureTestingModule({
      imports: [WorkspaceShellComponent],
      providers: [
        provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: SESSION_STORE, useValue: { current: () => ({ userId: 'u1', email: 'u1@example.test', fullName: 'U', roles: ['Student'] }) } }
      ]
    }).compileComponents();
    const fixture = TestBed.createComponent(WorkspaceShellComponent);
    fixture.componentRef.setInput('role', 'Student');
    fixture.componentRef.setInput('section', 'overview');
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const toggle = root.querySelector<HTMLButtonElement>('[data-drawer-toggle]')!;

    toggle.click();
    fixture.detectChanges();
    expect(root.querySelector('#workspace-navigation')?.getAttribute('data-drawer')).toBe('open');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(root.querySelector('#workspace-navigation')?.getAttribute('data-drawer')).toBe('closed');
    expect(document.activeElement).toBe(toggle);
    fixture.nativeElement.remove();
  });
});
