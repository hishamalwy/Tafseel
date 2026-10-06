import { TestBed } from '@angular/core/testing';
import { Type } from '@angular/core';
import { afterEach, expect, it } from 'vitest';
import { LocaleService } from '@core/i18n/locale.service';
import { TextFieldComponent } from './text-field.component';
import { PasswordFieldComponent } from './password-field.component';
afterEach(()=>TestBed.resetTestingModule());
for(const component of [TextFieldComponent,PasswordFieldComponent]) {
  it(`${component.name} preserves native field semantics with its label and error`,()=>{
    TestBed.configureTestingModule({providers:[{provide:LocaleService,useValue:{lang:()=> 'ar'}}]});
    const f=TestBed.createComponent(component as Type<TextFieldComponent | PasswordFieldComponent>);f.componentRef.setInput('fieldId','field');f.componentRef.setInput('label','Label');
    f.componentRef.setInput('name','native-name');f.componentRef.setInput('required',true);f.componentRef.setInput('readOnly',true);f.componentRef.setInput('disabled',true);f.componentRef.setInput('invalid',true);f.componentRef.setInput('message','Error');f.detectChanges();
    const input=f.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.name).toBe('native-name');expect(input.required).toBe(true);expect(input.disabled).toBe(true);expect(input.readOnly).toBe(true);
    expect(input.labels?.[0]?.textContent).toBe('Label');expect(input.getAttribute('aria-describedby')).toBe('field-msg');
    if(component===PasswordFieldComponent)expect(f.nativeElement.querySelector('button').disabled).toBe(true);
  });
}
