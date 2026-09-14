/**
 * PASS 01 — minimal HTML-parser evidence for table foster-parenting.
 *
 * Prints, for each markup shape, what the browser's parser actually built — at the document level
 * (what a served `.dc.html` goes through, and what `x-dc.innerHTML` therefore serializes) and at
 * the `template.innerHTML` level (what `compileTemplate()` re-parses).
 *
 * The result that motivates the whole pass: `<sc-for>`/`<sc-if>` inside a table section are
 * relocated out of the table and stripped of children, while `<template>` is left untouched.
 *
 * Run:  node tests/browser/dc-table-parser-evidence.mjs
 */
import { chromium } from '@playwright/test';

const CASES = {
  'sc-for in tbody': `<table id="t"><tbody id="b"><sc-for list="x" as="item"><tr><td>Value</td></tr></sc-for></tbody></table>`,
  'sc-if in tbody': `<table id="t"><tbody id="b"><sc-if value="y"><tr><td>Value</td></tr></sc-if></tbody></table>`,
  'template in tbody': `<table id="t"><tbody id="b"><template id="tp"><tr><td>Value</td></tr></template></tbody></table>`,
  'sc-for in table (no tbody)': `<table id="t"><sc-for list="x" as="item"><tr><td>Value</td></tr></sc-for></table>`,
  'sc-for in tr (cells)': `<table id="t"><tbody id="b"><tr id="r"><sc-for list="x" as="item"><td>Value</td></sc-for></tr></tbody></table>`,
  'sc-for in div (control)': `<div id="d"><sc-for list="x" as="item"><p>Value</p></sc-for></div>`,
  'RAW_WRAP aliased tags': `<sc-raw-table id="t"><sc-raw-tbody id="b"><sc-for list="x" as="item"><sc-raw-tr><sc-raw-td>Value</sc-raw-td></sc-raw-tr></sc-for></sc-raw-tbody></sc-raw-table>`,
};

const browser = await chromium.launch();
const page = await browser.newPage();
const out = {};

for (const [name, markup] of Object.entries(CASES)) {
  // (a) top-level document parse — exactly what a .dc.html page goes through
  await page.setContent(`<!doctype html><html><body><x-dc>${markup}</x-dc></body></html>`, { waitUntil: 'domcontentloaded' });
  const docParse = await page.evaluate(() => {
    const dc = document.querySelector('x-dc');
    const f = document.querySelector('sc-for') || document.querySelector('sc-if') || document.querySelector('template');
    const b = document.getElementById('b');
    return {
      xdcInnerHTML: dc.innerHTML,
      directiveParent: f ? (f.parentElement && f.parentElement.tagName.toLowerCase()) : null,
      directiveChildCount: f ? (f.tagName.toLowerCase() === 'template' ? f.content.childElementCount : f.childElementCount) : null,
      directiveOuterHTML: f ? f.outerHTML : null,
      sectionChildren: b ? [...b.children].map(c => c.tagName.toLowerCase()) : null,
    };
  });

  // (b) second parse — template.innerHTML, which is what compileTemplate() does
  const tplParse = await page.evaluate((m) => {
    const tpl = document.createElement('template');
    tpl.innerHTML = m;
    const f = tpl.content.querySelector('sc-for') || tpl.content.querySelector('sc-if') || tpl.content.querySelector('template');
    return {
      directiveParent: f ? (f.parentElement ? f.parentElement.tagName.toLowerCase() : '#fragment') : null,
      directiveChildCount: f ? (f.tagName.toLowerCase() === 'template' ? f.content.childElementCount : f.childElementCount) : null,
    };
  }, markup);

  out[name] = { source: markup, documentParse: docParse, templateInnerHTMLParse: tplParse };
}

console.log(JSON.stringify(out, null, 2));
await browser.close();
