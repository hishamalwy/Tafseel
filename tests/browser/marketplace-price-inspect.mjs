import { chromium } from "@playwright/test";
import { BASE_URL, setThemeAndLang } from "./lib/auth.mjs";

const b = await chromium.launch();
const p = await b.newPage();
await p.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await setThemeAndLang(p, "dark", "ar");
await p.goto(`${BASE_URL}/app/Tafseel-Browse-Teachers.dc.html`, { waitUntil: "networkidle" });
await p.waitForTimeout(1000);
const info = await p.evaluate(() => {
  const card = document.querySelector(".tf-result-card");
  const price = card?.querySelector(".tf-price-line");
  const mark = card?.querySelector(".tf-price-currency--mark");
  const cs = mark ? getComputedStyle(mark) : null;
  return {
    priceHtml: price?.innerHTML,
    priceText: price?.textContent,
    amount: card?.querySelector(".tf-price-xl")?.textContent,
    markW: cs?.width,
    markH: cs?.height,
    markColor: cs?.color,
    markMask: (cs?.webkitMaskImage || cs?.maskImage || "").slice(0, 60),
    cardW: card?.getBoundingClientRect().width,
  };
});
console.log(JSON.stringify(info, null, 2));
await b.close();
