import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';

export function pageFromQuery(value: string | null): number {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

/** The URL is the source of truth, including browser Back and contextual return links. */
export function injectListContext(read: (params: ParamMap) => void, load: () => void) {
  const route = inject(ActivatedRoute), router = inject(Router);
  const document = inject(DOCUMENT), injector = inject(Injector), destroy = inject(DestroyRef);
  route.queryParamMap.pipe(takeUntilDestroyed(destroy)).subscribe(params => { read(params); load(); });
  return {
    commit(params: Record<string, string | number | null>): void {
      const changed = Object.entries(params).some(([key, value]) => route.snapshot.queryParamMap.get(key) !== (value === null ? null : String(value)));
      if (changed) void router.navigate([], { relativeTo: route, queryParams: params, queryParamsHandling: 'merge' });
      else load();
    },
    restoreFocus(prefix: string): void {
      const id = route.snapshot.queryParamMap.get('focus');
      if (!id || destroy.destroyed) return;
      afterNextRender(() => document.getElementById(prefix + id)?.focus(), { injector });
    }
  };
}

/** Only list context is carried back, never arbitrary return URLs or resource metadata. */
export function returnQuery(params: ParamMap, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.flatMap(key => { const value = params.get(key); return value === null ? [] : [[key, value]]; }));
}
