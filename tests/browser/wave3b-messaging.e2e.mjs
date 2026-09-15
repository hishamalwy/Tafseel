/* Wave 3B end-to-end: messaging between an order's student and teacher (J9-02).
 *
 *   The setting is a real order: the student registers and requests, the teacher accepts.
 *   Both open the order's conversation from the order screen (one conversation, not two).
 *   The student writes; the teacher, already on the page, receives it over SignalR without a reload
 *   or a poll; the teacher replies; unread counts clear when the conversation is opened; a file
 *   sent in the thread opens for the participants and is refused to anyone else.
 *   Separately, with the hub blocked, the page says it is polling and the message still arrives.
 */
import assert from 'node:assert/strict';
import {
  BASE, SEED, acceptRequest, api, attribute, context, file, finish, pathOf, pdf, registerStudent, sendDirectRequest,
  shot, signIn, spa, sql, start, step, visit, waitForCall
} from './wave3b-harness.mjs';

const stamp = Date.now();
const studentEmail = `wave3b-msg-${stamp}@example.test`;
const studentPassword = `Wave3b!Msg-${stamp}`;
const teacherSeed = SEED.teacherB;

await start();
let orderId = '';
let conversationId = '';

const student = await context();
const teacher = await context();

await step('setting: the student requests and the teacher accepts, so an order exists', async () => {
  await registerStudent(student, `Wave3B Messaging Student ${stamp}`, studentEmail, studentPassword);
  const requestId = await sendDirectRequest(student, teacherSeed, `Messaging order ${stamp}`);
  await signIn(teacher, teacherSeed.Email);
  orderId = await acceptRequest(teacher, requestId, 120);
});

await step('J9-02 both participants open the order’s conversation from the order screen and reach the same thread', async () => {
  await spa(student, `/orders/${orderId}`);
  await student.page.locator('[data-testid=open-conversation]').click();
  await student.page.waitForURL(url => /^\/en\/conversations\/[0-9a-f-]{36}$/.test(pathOf(url)), { timeout: 15000 });
  conversationId = pathOf(student.page.url()).split('/').pop();
  await attribute(student.page, '[data-testid=realtime-state]', 'data-state', 'live');

  // The teacher waits in the inbox, so the arrival and the unread count can be seen live.
  await spa(teacher, '/messages');
  await attribute(teacher.page, '[data-testid=realtime-state]', 'data-state', 'live');
  await visit(teacher.page, `${BASE}/en/orders/${orderId}`);
  await teacher.page.locator('[data-testid=open-conversation]').click();
  await teacher.page.waitForURL(url => pathOf(url) === `/en/conversations/${conversationId}`, { timeout: 15000 });
  await attribute(teacher.page, '[data-testid=realtime-state]', 'data-state', 'live');
  assert.equal(sql(`SELECT COUNT(*) FROM Conversations WHERE ResourceId = '${orderId}'`), '1', 'one conversation for the order');
});

await step('J9-02 the teacher receives the student’s message over SignalR without reloading or polling', async () => {
  const { page } = teacher;
  await page.evaluate(() => { window.__sameDocument = true; });
  const pollsBefore = page.sent.filter(r => r.method() === 'GET' && r.url().includes(`/conversations/${conversationId}/messages`)).length;
  const text = `Is exercise 4 included? ${stamp}`;
  await student.page.locator('#message-body').fill(text);
  const sent = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/conversations/${conversationId}/messages$`));
  const started = Date.now();
  await student.page.locator('[data-testid=send-message]').click();
  assert.ok((await sent).ok(), 'sent');
  await page.locator('[data-testid=message][data-mine=false]', { hasText: text }).waitFor({ timeout: 7000 });
  const elapsed = Date.now() - started;
  assert.ok(await page.evaluate(() => window.__sameDocument === true), 'no page reload');
  const pollsAfter = page.sent.filter(r => r.method() === 'GET' && r.url().includes(`/conversations/${conversationId}/messages`)).length;
  assert.equal(pollsAfter, pollsBefore, 'the message was pushed, not fetched');
  console.log(`  received in ${elapsed} ms`);
  await shot(page, 'msg-01-teacher-received');
});

await step('J9-02 the teacher replies and the student receives it live', async () => {
  const text = `Yes, exercises 1 to 6. ${stamp}`;
  await student.page.evaluate(() => { window.__sameDocument = true; });
  await teacher.page.locator('#message-body').fill(text);
  await teacher.page.locator('[data-testid=send-message]').click();
  await student.page.locator('[data-testid=message][data-mine=false]', { hasText: text }).waitFor({ timeout: 7000 });
  assert.ok(await student.page.evaluate(() => window.__sameDocument === true), 'no page reload');
  assert.equal(await student.page.locator('[data-testid=message]').count(), 2);
});

await step('J9-02 unread state: a message to someone in the inbox shows as unread and clears when they open it', async () => {
  // The student waits in the inbox while the teacher writes.
  await spa(student, '/messages');
  const link = student.page.locator(`[data-testid=conversation-link][data-conversation-id="${conversationId}"]`);
  await attribute(student.page, `[data-testid=conversation-link][data-conversation-id="${conversationId}"]`, 'data-unread', 0);
  await teacher.page.locator('#message-body').fill(`Also bring your notes. ${stamp}`);
  await teacher.page.locator('[data-testid=send-message]').click();
  await attribute(student.page, `[data-testid=conversation-link][data-conversation-id="${conversationId}"]`, 'data-unread', 1, 15000);
  await student.page.locator('[data-testid=unread-count]').waitFor();
  await shot(student.page, 'msg-02-unread');

  const read = waitForCall(student.page, 'POST', new RegExp(`^/api/v1/conversations/${conversationId}/read$`));
  await link.click();
  assert.equal((await read).status(), 204);
  await attribute(student.page, `[data-testid=conversation-link][data-conversation-id="${conversationId}"]`, 'data-unread', 0);
  const unread = await api(studentEmail, 'GET', '/api/v1/conversations?page=1&pageSize=50', undefined, {}, studentPassword);
  assert.equal(unread.body.items.find(c => c.id === conversationId).unreadCount, 0, 'the server agrees it is read');
});

await step('J9-02 a file in the thread opens for the participants and is refused to anyone else', async () => {
  const { page } = student;
  await page.locator('#message-body').fill(`My notes for exercise 4. ${stamp}`);
  await page.locator('#message-file').setInputFiles(file('notes.pdf', pdf('student notes')));
  const uploaded = waitForCall(page, 'POST', /^\/api\/v1\/messages\/[0-9a-f-]{36}\/attachments$/);
  await page.locator('[data-testid=send-message]').click();
  const response = await uploaded;
  assert.ok(response.ok(), `attachment ${response.status()}`);
  const attachmentId = (await response.json()).id;

  const attachment = teacher.page.locator('[data-testid=message-attachment]', { hasText: /notes\.pdf/ });
  await attachment.waitFor({ timeout: 15000 });
  const content = waitForCall(teacher.page, 'GET', new RegExp(`^/api/v1/message-attachments/${attachmentId}/content$`));
  await attachment.click();
  assert.equal((await content).status(), 200, 'the teacher opens it through the protected endpoint');
  await teacher.page.locator('tf-protected-file-viewer iframe').waitFor({ timeout: 15000 });
  await shot(teacher.page, 'msg-03-attachment-viewer');
  await teacher.page.keyboard.press('Escape');
  await teacher.page.locator('tf-protected-file-viewer iframe').waitFor({ state: 'hidden', timeout: 10000 });

  assert.equal((await api(SEED.outsider.Email, 'GET', `/api/v1/message-attachments/${attachmentId}/content`)).status, 404);
  assert.equal((await api(SEED.teacherA.Email, 'GET', `/api/v1/message-attachments/${attachmentId}/content`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/v1/message-attachments/${attachmentId}/content`)).status, 401);
  assert.equal((await api(SEED.outsider.Email, 'GET', `/api/v1/conversations/${conversationId}/messages`)).status, 404);
  const html = await teacher.page.content();
  assert.ok(!/blob\.core\.windows\.net|storageKey|\/uploads\//i.test(html), 'no storage address in the page');
});

await step('fallback: with the hub unreachable the page says it is polling and the message still arrives', async () => {
  const offline = await context();
  await offline.ctx.route('**/hubs/messages/**', route => route.abort());
  await offline.ctx.route('**/hubs/messages?**', route => route.abort());
  await signIn(offline, studentEmail, studentPassword);
  await spa(offline, `/conversations/${conversationId}`);
  await attribute(offline.page, '[data-testid=realtime-state]', 'data-state', 'polling', 20000);
  const text = `Polling check ${stamp}`;
  await teacher.page.locator('#message-body').fill(text);
  await teacher.page.locator('[data-testid=send-message]').click();
  await offline.page.locator('[data-testid=message]', { hasText: text }).waitFor({ timeout: 20000 });
  assert.ok(offline.page.sent.some(r => r.method() === 'GET' && r.url().includes(`/conversations/${conversationId}/messages`)), 'fetched by polling');
  await shot(offline.page, 'msg-04-polling');
  assert.deepEqual(offline.page.problems, []);
  await offline.ctx.close();
});

await step('no script errors on any page', async () => {
  assert.deepEqual([...student.page.problems, ...teacher.page.problems], []);
});

await finish('Wave 3B messaging');
