/**
 * Sprint 6 — notification deep-link routing smoke (Node).
 * Run: node scripts/ci/check-sprint6-notification-routing.mjs
 *
 * Loads only the pure helpers from tafseel.js (no DOM init).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = fs.readFileSync(path.join(root, 'js/tafseel.js'), 'utf8');

function extractFn(name) {
  const start = src.indexOf(`${name}: function`);
  if (start < 0) throw new Error(`Missing ${name}`);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = src.slice(start, i + 1);
        return body.replace(`${name}: function`, 'function');
      }
    }
  }
  throw new Error(`Unclosed ${name}`);
}

const buildMatch = src.match(/__build:\s*'([^']+)'/);
if (!buildMatch || buildMatch[1] !== 'r3s6') {
  throw new Error(`Expected Tafseel.__build r3s6, got ${buildMatch && buildMatch[1]}`);
}

const stub = {
  t(key) { return key; },
  lang: 'en',
  notificationRoute: null,
  orderPresentation: null
};
// eslint-disable-next-line no-new-func
const assign = new Function('self', `
  self.notificationRoute = (${extractFn('notificationRoute')}).bind(self);
  self.orderPresentation = (${extractFn('orderPresentation')}).bind(self);
`);
assign(stub);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const orderId = '11111111-1111-1111-1111-111111111111';
const conversationId = '22222222-2222-2222-2222-222222222222';
const T = stub;

const pay = T.notificationRoute({ type: 'PaymentRequired', link: `/orders/${orderId}` }, 'student');
assert(pay.href.includes('Tafseel-Payment.dc.html') && pay.href.includes(orderId), 'payment required → payment page');
assert(pay.focus === 'pay', 'payment focus');

const delivery = T.notificationRoute({ type: 'DeliveryUploaded', link: `/orders/${orderId}` }, 'student');
assert(delivery.section === 'requests' && delivery.filter === 'action', 'delivery → action filter');
assert(delivery.focus === 'delivery' && delivery.orderId === orderId, 'delivery order focus');

const completed = T.notificationRoute({ type: 'OrderCompleted', link: `/orders/${orderId}` }, 'student');
assert(completed.filter === 'done' && completed.focus === 'rate', 'completed → done + rate');

const reviewSubmitted = T.notificationRoute({ type: 'ReviewSubmitted', link: `/orders/${orderId}` }, 'student');
assert(reviewSubmitted.filter === 'done' && reviewSubmitted.focus === 'review', 'review submitted → done');

const msg = T.notificationRoute({ type: 'NewMessage', link: `/conversations/${conversationId}` }, 'student');
assert(msg.section === 'messages' && msg.conversationId === conversationId, 'message → conversations');

const unknown = T.notificationRoute({ type: 'TotallyUnknown', link: '' }, 'student');
assert(unknown.section === 'overview' && unknown.href.includes('Student-Dashboard'), 'unknown → safe dashboard');

const presentationRated = T.orderPresentation(4, 1, 'student', { hasReview: true, reviewCanSubmit: false });
assert(presentationRated.action === null, 'completed + reviewed has no rate action');
const presentationOpen = T.orderPresentation(4, 1, 'student', { hasReview: false, reviewCanSubmit: true });
assert(presentationOpen.action === 'rate', 'completed + eligible offers rate');

console.log('Sprint 6 notification routing checks passed.');
