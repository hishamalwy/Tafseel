import { readFileSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const domain = read('src/Tafseel.Domain/Messaging/Messaging.cs');
const service = read('src/Tafseel.Infrastructure/Messaging/MessagingService.cs');
const widget = read('js/chat-widget.js');
const student = read('Tafseel-Student-Dashboard.dc.html');
const teacher = read('Tafseel-Teacher-Dashboard.dc.html');
const locales = read('js/locales.js');

assert(domain.includes('ConversationScope { General, LearningRequest, Order, LiveSession }'), 'canonical Order conversation scope is missing');
assert(!/class\s+(OrderChat|OrderMessageV2|MarketplaceConversation2|LearningRequestChat|TeacherStudentChat)/.test(domain), 'duplicate messaging aggregate detected');
assert(service.includes('IsolationLevel.Serializable') && service.includes('sp_getapplock'), 'duplicate conversation prevention is missing');
assert(service.includes('participant.UserId == userId') && service.includes('message.SenderId != userId'), 'persisted unread projection is missing');
assert(service.includes('message-attachments') && service.includes('ConversationParticipant'), 'canonical attachment authorization is missing');
assert(service.includes('New message from') && !service.includes('input.Body, $"/conversations/'), 'notification must identify context without leaking message body');
assert(!widget.includes('findPaged'), 'Order context lookup must not scan paged Order/request lists');
assert(widget.includes("querySelector('.tf-chat-widget')"), 'chat widget inject must be idempotent');
assert(widget.includes('selectSeq') && widget.includes('disconnectHub'), 'conversation select generation and hub dispose are required');
assert(widget.includes('__tafseelMessageHub') && widget.includes('__tafseelEnsureHub'), 'SignalR hub must be a page-scoped singleton across DC reinject');
assert(widget.includes("document.addEventListener('tafseel:auth'"), 'chat boot must retry after delayed auth');
assert(widget.includes("'/orders/' + conversation.resourceId"), 'Order context lookup must target GET /orders/{id}');
assert(widget.includes("'/learning-requests/' + order.learningRequestId"), 'Request context lookup must target GET /learning-requests/{id}');
for (const page of [student, teacher]) {
  assert(page.includes('TafseelChat.openOrder'), 'dashboard Order entry point is missing');
  assert(page.includes('c.onOpen'), 'generic inbox must open the selected canonical conversation');
}
assert(teacher.includes('openNotification'), 'teacher notification deep link handler is missing');
for (const token of ['scope: 2', '/orders/', '/timeline', '/learning-requests/', '/message-attachments/', 'data-load-older', 'MessageReceived', 'some(function (x)', 'conversationId'])
  assert(widget.includes(token), `Order communication widget is missing ${token}`);
for (const key of ['chat_order_conversation', 'chat_request_files', 'chat_event_payment_confirmed', 'chat_load_older'])
  assert((locales.match(new RegExp(`"${key}"`, 'g')) || []).length >= 2, `AR/EN localization missing for ${key}`);

console.log('Release 5 Order communication integrity passed.');
