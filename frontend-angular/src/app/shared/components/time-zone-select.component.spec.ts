import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it } from 'vitest';
import { LocaleService } from '@core/i18n/locale.service';
import { TimeZoneSelectComponent } from './time-zone-select.component';
import { timeZoneLabel } from '@shared/utils/time-zones';
afterEach(()=>TestBed.resetTestingModule());
it('keeps the current IANA value when search excludes it, and searches Arabic city names',()=>{
  TestBed.configureTestingModule({providers:[{provide:LocaleService,useValue:{lang:()=> 'ar',t:(_k:string,f:string)=>f}}]});
  const f=TestBed.createComponent(TimeZoneSelectComponent);
  f.componentRef.setInput('fieldId','zone');f.componentRef.setInput('value','Asia/Riyadh');f.componentRef.setInput('choices',['Asia/Riyadh','Asia/Kuwait','Europe/Paris']);
  f.componentInstance.search.set('باريس');
  expect(f.componentInstance.visible().map(o=>o.zone)).toEqual(['Asia/Riyadh','Europe/Paris']);
  expect(f.componentInstance.value()).toBe('Asia/Riyadh');
  expect(timeZoneLabel('Asia/Riyadh','ar')).not.toBe(timeZoneLabel('Asia/Kuwait','ar'));
});
