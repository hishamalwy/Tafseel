import { ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { Title } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleService } from '@core/i18n/locale.service';
import { DialogService } from '@shared/services/dialog.service';
import { Demand, OpenRequestDraft, SavedOpenDraft } from '../models/demand';
import { LoadOpenRequestForm, OpenRequestDrafts, PublishOpenRequest } from '../services/demand.use-cases';
import { OpenRequestPageComponent } from './open-request-page.component';

afterEach(() => { TestBed.resetTestingModule(); vi.useRealTimers(); });
function deferred<T>() { let resolve!: (value:T)=>void; let reject!: (error:unknown)=>void; const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function saved(fields:OpenRequestDraft):SavedOpenDraft { return {id:'draft',fields,attachments:[],maxAttachments:5}; }
async function setup() {
  vi.useFakeTimers();
  const save=vi.fn<(fields:OpenRequestDraft)=>Promise<SavedOpenDraft>>();
  TestBed.configureTestingModule({providers:[
    {provide:ElementRef,useValue:new ElementRef(document.createElement('div'))},
    {provide:Title,useValue:{setTitle:vi.fn()}}, {provide:Router,useValue:{navigate:vi.fn().mockResolvedValue(true)}},
    {provide:ActivatedRoute,useValue:{snapshot:{queryParamMap:convertToParamMap({})}}},
    {provide:LocaleService,useValue:{t:(_k:string,f:string)=>f,lang:()=> 'ar',isRtl:()=>true}},
    {provide:DialogService,useValue:{confirm:vi.fn().mockResolvedValue(false)}},
    {provide:LoadOpenRequestForm,useValue:{execute:vi.fn().mockResolvedValue({subjects:[],serviceTypes:[]})}},
    {provide:OpenRequestDrafts,useValue:{load:vi.fn().mockResolvedValue(null),save}},
    {provide:PublishOpenRequest,useValue:{execute:vi.fn()}}
  ]});
  const page=TestBed.runInInjectionContext(()=>new OpenRequestPageComponent());
  await Promise.resolve();await Promise.resolve();
  return {page,save};
}
describe('open request autosave',()=>{
  it('serializes saves and does not mark newer edits saved by an older response',async()=>{
    const {page,save}=await setup(); const first=deferred<SavedOpenDraft>(),second=deferred<SavedOpenDraft>();
    save.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    page.set('title','First'); await vi.advanceTimersByTimeAsync(600);
    page.set('title','Latest'); await vi.advanceTimersByTimeAsync(600);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve(saved({...Demand.emptyOpenDraft(),title:'First'}));await vi.advanceTimersByTimeAsync(0);
    expect(page.draftStatus()).toBe('saving'); expect(page.unsavedChanges.isDirty()).toBe(true);
    await vi.advanceTimersByTimeAsync(600); expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].title).toBe('Latest');
    second.resolve(saved(page.draft()));await vi.advanceTimersByTimeAsync(0);
    expect(page.draftStatus()).toBe('saved');expect(page.unsavedChanges.isDirty()).toBe(false);
  });
  it('keeps failed edits dirty and offers a successful explicit retry',async()=>{
    const {page,save}=await setup();save.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async fields=>saved(fields));
    page.set('title','Retain this');await vi.advanceTimersByTimeAsync(600);
    expect(page.draftStatus()).toBe('error');expect(await page.unsavedChanges.canLeave()).toBe(false);
    expect(page.draft().title).toBe('Retain this');await page.saveDraft();
    expect(page.draftStatus()).toBe('saved');expect(page.unsavedChanges.isDirty()).toBe(false);
  });
  it('cancels a queued save when its page is destroyed',async()=>{
    const {page,save}=await setup();page.set('title','Queued');TestBed.resetTestingModule();
    await vi.advanceTimersByTimeAsync(600);expect(save).not.toHaveBeenCalled();
  });
});
