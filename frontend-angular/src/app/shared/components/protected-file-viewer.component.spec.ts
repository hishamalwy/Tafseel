import { TestBed } from '@angular/core/testing';
import { afterEach, expect, it, vi } from 'vitest';
import { SESSION_STORE } from '@core/auth/services/auth.ports';
import { ProtectedFile } from '@core/http/protected-file.service';
import { LocaleService } from '@core/i18n/locale.service';
import { ProtectedFileViewerComponent } from './protected-file-viewer.component';
afterEach(()=>{TestBed.resetTestingModule();delete (HTMLDialogElement.prototype as unknown as Record<string,unknown>)['showModal'];});
it('retries the same authorized content endpoint inside the existing named dialog',async()=>{
  const objectUrl=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({url:'blob:private',contentType:'image/png',revoke:vi.fn()});
  Object.defineProperty(HTMLDialogElement.prototype,'showModal',{configurable:true,value:function(this:HTMLDialogElement){this.setAttribute('open','');}});
  TestBed.configureTestingModule({providers:[{provide:ProtectedFile,useValue:{objectUrl}}, {provide:SESSION_STORE,useValue:{current:()=>null}}, {provide:LocaleService,useValue:{t:(_k:string,f:string)=>f}}]});
  const f=TestBed.createComponent(ProtectedFileViewerComponent);f.detectChanges();
  await f.componentInstance.open('/api/v1/orders/one/files/two/content','lesson.png','image/png');f.detectChanges();
  const dialog=f.nativeElement.querySelector('dialog') as HTMLDialogElement;
  expect(f.nativeElement.querySelector('h2').id).toBe(dialog.getAttribute('aria-labelledby'));
  expect(f.componentInstance.failed()).toBe(true);f.componentInstance.retry();await Promise.resolve();await Promise.resolve();f.detectChanges();
  expect(objectUrl.mock.calls.map(args=>args[0])).toEqual(['/api/v1/orders/one/files/two/content','/api/v1/orders/one/files/two/content']);
  expect(f.componentInstance.failed()).toBe(false);expect(dialog.open).toBe(true);expect(f.nativeElement.querySelector('img').src).toBe('blob:private');
});
