import { convertToParamMap } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { pageFromQuery, returnQuery } from './list-context';

describe('list return context', () => {
  it('accepts a positive whole page and recovers from malformed URLs', () => {
    expect(pageFromQuery('7')).toBe(7);
    for (const value of [null, '', '0', '-1', '1.5', 'Infinity', 'x', '9007199254740992']) expect(pageFromQuery(value)).toBe(1);
  });
  it('carries only approved filters and focus back to the queue', () => {
    const params = convertToParamMap({scope:'All', status:'0', focus:'item-123', returnTo:'https://example.com', id:'another-record'});
    expect(returnQuery(params,['scope','status','page','focus'])).toEqual({scope:'All',status:'0',focus:'item-123'});
  });
});
