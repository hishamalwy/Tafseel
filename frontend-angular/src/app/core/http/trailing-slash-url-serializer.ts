import { DefaultUrlSerializer, UrlSerializer, UrlTree } from '@angular/router';

/**
 * Every route URL ends in `/`.
 *
 * One canonical spelling per page matters beyond taste: `/auth` and `/auth/`
 * are two URLs to a crawler, and the prerender writes `…/index.html` under a
 * directory, which is the trailing-slash form. Normalising on parse means an
 * incoming `/auth` still matches; normalising on serialise means every link the
 * router writes carries the slash.
 */
export class TrailingSlashUrlSerializer extends DefaultUrlSerializer {
  override parse(url: string): UrlTree {
    // Strip it for matching so the route table stays free of slash variants.
    const [path, rest] = splitQueryAndFragment(url);
    const normalised = path.length > 1 ? path.replace(/\/+$/, '') : path;
    return super.parse(normalised + rest);
  }

  override serialize(tree: UrlTree): string {
    const serialized = super.serialize(tree);
    const [path, rest] = splitQueryAndFragment(serialized);
    if (path === '/' || path.endsWith('/')) return path + rest;
    return path + '/' + rest;
  }
}

function splitQueryAndFragment(url: string): [string, string] {
  const cut = url.search(/[?#]/);
  return cut === -1 ? [url, ''] : [url.slice(0, cut), url.slice(cut)];
}

export const trailingSlashUrlSerializer = {
  provide: UrlSerializer,
  useClass: TrailingSlashUrlSerializer
};
