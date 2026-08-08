(function () {
  'use strict';
  var session, conversations = [], active, messages = [], context, hub, timer, messagePage = 1, messageTotal = 0, selectSeq = 0, connectCount = 0;

  function t(key, fallback) {
    var value = window.Tafseel && Tafseel.t(key);
    return value && value !== key ? value : fallback;
  }
  function esc(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }
  function other(conversation) {
    var peer = (conversation.participants || []).find(function (x) { return x.userId !== session.userId; });
    return peer ? {
      id: peer.userId,
      displayName: Tafseel.participantLabel(peer),
      initials: Tafseel.participantInitials(peer),
      role: peer.role || ''
    } : { id: '', displayName: t('name_unavailable', 'Name unavailable'), initials: '··', role: '' };
  }
  function statusLabel(order) {
    if (!order) return '';
    var role = (session.roles || []).indexOf('Teacher') >= 0 ? 'teacher' : 'student';
    return Tafseel.t(Tafseel.orderPresentation(order.status, order.paymentStatus, role).labelKey);
  }
  function inject() {
    if (document.querySelector('.tf-chat-widget')) return;
    var style = document.createElement('style');
    style.textContent = '.tf-chat-launch{position:fixed;inset-inline-end:22px;inset-block-end:22px;z-index:90;width:52px;height:52px;border:0;border-radius:50%;background:var(--primary);color:var(--primary-ink);box-shadow:var(--shadow-lg);font-size:20px}.tf-chat-badge{position:absolute;inset-block-start:-4px;inset-inline-end:-4px;min-width:20px;height:20px;padding:0 5px;display:none;place-items:center;border-radius:99px;background:var(--danger);color:#fff;font-size:11px;font-weight:800}.tf-chat-widget{position:fixed;inset-inline-end:22px;inset-block-end:86px;z-index:91;width:min(860px,calc(100vw - 32px));height:min(680px,calc(100dvh - 112px));display:none;grid-template-columns:260px 1fr;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);overflow:hidden}.tf-chat-widget[data-open=true]{display:grid}.tf-chat-widget[data-max=true]{inset:20px;width:calc(100vw - 40px);height:calc(100dvh - 40px)}.tf-chat-list{border-inline-end:1px solid var(--border);overflow:auto}.tf-chat-head{min-height:56px;padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px}.tf-chat-tools{display:flex;align-items:center}.tf-chat-item{display:flex;width:100%;gap:10px;padding:13px;border:0;border-bottom:1px solid var(--border);background:transparent;text-align:start;color:var(--text)}.tf-chat-item:hover,.tf-chat-item[aria-current=true]{background:var(--surface-2)}.tf-chat-item>span{min-width:0;flex:1}.tf-chat-preview{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tf-chat-avatar{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-weight:800;flex:none}.tf-chat-unread{float:inline-end;min-width:20px;height:20px;padding:0 5px;border-radius:99px;background:var(--primary);color:var(--primary-ink);font-size:11px;display:grid;place-items:center}.tf-chat-thread{display:grid;grid-template-rows:auto auto 1fr auto;min-width:0;min-height:0}.tf-chat-context{padding:11px 14px;border-bottom:1px solid var(--border);background:var(--surface-2);font-size:12px;color:var(--text-2)}.tf-chat-context strong{color:var(--text)}.tf-chat-context-row,.tf-chat-files{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tf-chat-files{margin-top:7px}.tf-chat-file{border:1px solid var(--border);border-radius:6px;background:var(--surface);color:var(--primary);padding:4px 7px;font-size:11px}.tf-chat-messages{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}.tf-chat-bubble{max-width:78%;padding:9px 12px;border-radius:14px;background:var(--surface-2);white-space:pre-wrap;overflow-wrap:anywhere}.tf-chat-bubble[data-mine=true]{align-self:flex-end;background:var(--primary);color:var(--primary-ink)}.tf-chat-meta{display:block;margin-top:5px;font-size:10px;opacity:.72}.tf-chat-system{align-self:center;max-width:90%;padding:5px 10px;border-radius:99px;background:var(--surface-2);color:var(--muted);font-size:11px;text-align:center}.tf-chat-compose{display:grid;grid-template-columns:auto 1fr auto;gap:8px;padding:12px;border-top:1px solid var(--border);align-items:end}.tf-chat-compose textarea{min-width:0;min-height:40px;max-height:110px;resize:vertical}.tf-chat-attach{width:40px;height:40px;display:grid;place-items:center;border:1px solid var(--border);border-radius:var(--r-sm);cursor:pointer}.tf-chat-file-name,.tf-chat-status{grid-column:1/-1;margin:0;font-size:11px}.tf-chat-close{border:0;background:transparent;color:var(--muted);font-size:18px}.tf-chat-empty{margin:auto;color:var(--muted);padding:18px;text-align:center}@media(max-width:680px){.tf-chat-widget,.tf-chat-widget[data-max=true]{inset:0;width:100vw;height:100dvh;border-radius:0;grid-template-columns:1fr}.tf-chat-list{display:none}.tf-chat-widget[data-pane=list] .tf-chat-list{display:block}.tf-chat-widget[data-pane=list] .tf-chat-thread{display:none}.tf-chat-back{display:inline!important}.tf-chat-tools [data-max]{display:none}.tf-chat-compose{padding-bottom:max(12px,env(safe-area-inset-bottom))}.tf-chat-bubble{max-width:88%}}';
    document.head.appendChild(style);
    document.body.insertAdjacentHTML('beforeend',
      '<button class="tf-chat-launch" type="button" aria-label="' + esc(t('chat_messages', 'Messages')) + '">✉<span class="tf-chat-badge" data-badge></span></button>' +
      '<aside class="tf-chat-widget" data-open="false" data-pane="list" role="dialog" aria-label="' + esc(t('chat_messages', 'Messages')) + '">' +
      '<section class="tf-chat-list"><div class="tf-chat-head"><strong>' + esc(t('chat_messages', 'Messages')) + '</strong><button class="tf-chat-close" data-close aria-label="' + esc(t('chat_close', 'Close')) + '">×</button></div><div data-conversations></div></section>' +
      '<section class="tf-chat-thread"><div class="tf-chat-head"><span><button class="tf-chat-close tf-chat-back" data-back style="display:none" aria-label="' + esc(t('chat_back', 'Back')) + '">‹</button> <strong data-title>' + esc(t('chat_conversation', 'Conversation')) + '</strong></span><span class="tf-chat-tools"><button class="tf-chat-close" data-min aria-label="' + esc(t('chat_minimize', 'Minimize')) + '">−</button><button class="tf-chat-close" data-max aria-label="' + esc(t('chat_maximize', 'Maximize')) + '">□</button><button class="tf-chat-close" data-close aria-label="' + esc(t('chat_close', 'Close')) + '">×</button></span></div>' +
      '<div class="tf-chat-context" data-context hidden></div><div class="tf-chat-messages" data-messages aria-live="polite"><p class="tf-chat-empty">' + esc(t('chat_choose_conversation', 'Choose a conversation')) + '</p></div>' +
      '<form class="tf-chat-compose" data-r5-composer><label class="tf-chat-attach" title="' + esc(t('chat_add_attachment', 'Add attachment')) + '" data-r5-attach>📎<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.docx,.pptx,.zip" data-r5-file></label><textarea maxlength="4000" required aria-label="' + esc(t('chat_message', 'Message')) + '" placeholder="' + esc(t('chat_write_message', 'Write a message…')) + '" data-r5-input></textarea><button class="tf-button" type="submit" data-r5-send>' + esc(t('chat_send', 'Send')) + '</button><span class="tf-chat-file-name" data-file-name></span><p class="tf-chat-status" data-chat-status role="status"></p></form></section></aside>');
  }
  function renderList() {
    var root = document.querySelector('[data-conversations]');
    root.innerHTML = conversations.length ? conversations.map(function (x) {
      var person = other(x), latest = x.latestMessage && x.latestMessage.body || t('chat_no_messages', 'No messages yet');
      return '<button class="tf-chat-item" data-conversation="' + esc(x.id) + '" aria-current="' + String(active && active.id === x.id) + '"><span class="tf-chat-avatar" aria-hidden="true">' + esc(person.initials) + '</span><span><strong>' + esc(person.displayName) + '</strong>' + (x.unreadCount ? '<span class="tf-chat-unread">' + esc(x.unreadCount) + '</span>' : '') + '<small class="tf-muted" style="display:block">' + esc(x.scope === 2 ? t('chat_order_conversation', 'Order conversation') : person.role) + '</small><span class="tf-muted tf-chat-preview">' + esc(latest) + '</span></span></button>';
    }).join('') : '<p class="tf-chat-empty">' + esc(t('chat_no_conversations', 'No conversations yet')) + '</p>';
    root.querySelectorAll('[data-conversation]').forEach(function (button) { button.onclick = function () { select(button.dataset.conversation); }; });
  }
  function eventLabel(event) {
    var labels = {
      awaiting_payment: t('chat_event_request_accepted', 'Teacher accepted the request.'),
      payment_confirmed: t('chat_event_payment_confirmed', 'Payment confirmed.'),
      payment_refunded: t('chat_event_payment_refunded', 'Payment refunded.'),
      work_started: t('chat_event_work_started', 'Teacher started working on this order.'),
      delivery_uploaded: t('chat_event_delivery_uploaded', 'A new delivery was submitted.'),
      revision_requested: t('chat_event_revision_requested', 'A revision was requested.'),
      request_submitted: t('chat_event_request_submitted', 'Learning request submitted.'),
      completed: t('chat_event_completed', 'Order completed.'),
      cancelled: t('chat_event_cancelled', 'Order cancelled.')
    };
    return labels[event.eventType] || '';
  }
  function attachmentButton(path, item) {
    return '<button type="button" class="tf-chat-file" data-file-url="' + esc(path) + '" data-file-name="' + esc(item.originalName || 'attachment') + '">📎 ' + esc(item.originalName || t('chat_attachment', 'Attachment')) + '</button>';
  }
  function bindDownloads(root) {
    root.querySelectorAll('[data-file-url]').forEach(function (button) {
      button.onclick = function () { Tafseel.api.openBlob(button.dataset.fileUrl, { download: true, fileName: button.dataset.fileName }).catch(showError); };
    });
  }
  function renderContext() {
    var root = document.querySelector('[data-context]');
    root.hidden = !context;
    if (!context) { root.innerHTML = ''; return; }
    var order = context.order, request = context.request;
    var requestFiles = (request && request.attachments || []).map(function (file) { return attachmentButton('/learning-requests/attachments/' + file.id + '/content', file); }).join('');
    var deliveryFiles = (order.deliveries || []).map(function (file) { return attachmentButton('/orders/deliveries/' + file.id + '/content', file); }).join('');
    root.innerHTML = '<div class="tf-chat-context-row"><strong>' + esc(order.serviceNameEnglish || order.requestTitle || t('chat_order', 'Order')) + '</strong><span>·</span><span>#' + esc(String(order.id).slice(0, 8).toUpperCase()) + '</span><span>·</span><span>' + esc(statusLabel(order)) + '</span><span>·</span><span>' + esc(Tafseel.money(order.price, order.currency)) + '</span><span>·</span><span>' + esc(Tafseel.date(order.agreedDeliveryAt)) + '</span></div>' +
      (requestFiles ? '<div class="tf-chat-files"><span>' + esc(t('chat_request_files', 'Original request files:')) + '</span>' + requestFiles + '</div>' : '') +
      (deliveryFiles ? '<div class="tf-chat-files"><span>' + esc(t('chat_delivery_files', 'Deliveries:')) + '</span>' + deliveryFiles + '</div>' : '');
    bindDownloads(root);
  }
  function renderMessages() {
    var root = document.querySelector('[data-messages]');
    var rows = messages.map(function (x) { return { kind: 'message', at: x.createdAt, id: x.id, value: x }; });
    (context && context.timeline || []).forEach(function (x) { if (eventLabel(x)) rows.push({ kind: 'event', at: x.occurredAt, id: x.id, value: x }); });
    if (context && context.request) rows.push({ kind: 'event', at: context.request.createdAt, id: 'request:' + context.request.id, value: { eventType: 'request_submitted' } });
    rows.sort(function (a, b) { return new Date(a.at) - new Date(b.at) || String(a.id).localeCompare(String(b.id)); });
    root.innerHTML = (messageTotal > messages.length ? '<button type="button" class="tf-chat-file" data-load-older>' + esc(t('chat_load_older', 'Load older messages')) + '</button>' : '') + (rows.length ? rows.map(function (row) {
      if (row.kind === 'event') return '<div class="tf-chat-system">' + esc(eventLabel(row.value)) + ' · ' + esc(Tafseel.date(row.at)) + '</div>';
      var x = row.value;
      var files = (x.attachments || []).map(function (file) { return attachmentButton('/message-attachments/' + file.id + '/content', file); }).join('');
      return '<div class="tf-chat-bubble" data-mine="' + String(x.senderId === session.userId) + '">' + esc(x.body) + (files ? '<div class="tf-chat-files">' + files + '</div>' : '') + '<small class="tf-chat-meta">' + esc(Tafseel.date(x.createdAt)) + '</small></div>';
    }).join('') : '<p class="tf-chat-empty">' + esc(t('chat_no_messages', 'No messages yet')) + '</p>');
    bindDownloads(root);
    var older = root.querySelector('[data-load-older]'); if (older) older.onclick = function () { loadOlder().catch(showError); };
    root.scrollTop = root.scrollHeight;
  }
  async function loadOlder() {
    var page = await Tafseel.api.get('/conversations/' + active.id + '/messages?page=' + (messagePage + 1) + '&pageSize=100');
    messagePage++;
    (page.items || []).forEach(function (item) { if (!messages.some(function (x) { return x.id === item.id; })) messages.push(item); });
    messages.sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)); });
    renderMessages();
  }
  async function loadList() {
    var page = await Tafseel.api.get('/conversations?pageSize=50');
    conversations = page.items || [];
    var unread = conversations.reduce(function (sum, x) { return sum + (x.unreadCount || 0); }, 0), badge = document.querySelector('[data-badge]');
    badge.textContent = unread > 99 ? '99+' : String(unread); badge.style.display = unread ? 'grid' : 'none';
    if (active) active = conversations.find(function (x) { return x.id === active.id; }) || active;
    renderList();
  }
  async function loadContext(conversation) {
    context = null; renderContext();
    if (conversation.scope !== 2 || !conversation.resourceId) return;
    var order = await Tafseel.api.get('/orders/' + conversation.resourceId);
    if (!order) return;
    var results = await Promise.all([
      Tafseel.api.get('/orders/' + order.id + '/timeline'),
      order.learningRequestId
        ? Tafseel.api.get('/learning-requests/' + order.learningRequestId).catch(function () { return null; })
        : Promise.resolve(null)
    ]);
    context = { order: order, timeline: results[0] || [], request: results[1] };
    renderContext(); renderMessages();
  }
  async function select(id) {
    var requestId = ++selectSeq;
    var widget = document.querySelector('.tf-chat-widget');
    if (!widget) return;
    widget.dataset.open = 'true';
    widget.dataset.pane = 'thread';
    active = conversations.find(function (x) { return String(x.id) === String(id); }) || { id: id, participants: [], version: '' };
    window.__tafseelActiveConversationId = active.id;
    document.querySelector('[data-title]').textContent = other(active).displayName;
    var page;
    try { page = await Tafseel.api.get('/conversations/' + id + '/messages?pageSize=100'); }
    catch (error) { showError(error); return; }
    if (requestId !== selectSeq) return;
    messagePage = 1; messageTotal = page.totalCount || 0;
    messages = (page.items || []).slice().sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt) || String(a.id).localeCompare(String(b.id)); });
    renderMessages();
    await loadContext(active).catch(showError);
    if (requestId !== selectSeq) return;
    if (active.version) {
      await Tafseel.api.post('/conversations/' + id + '/read', null, { 'If-Match': active.version }).catch(function (error) { if (error.status !== 409) showError(error); });
    }
    await (window.__tafseelEnsureHub || connect)();
    hub = sharedHub() || hub;
    if (hub && (hub.state === 'Connected' || hub.state === 1)) await hub.invoke('JoinConversation', id).catch(function () {});
    await loadList();
    if (requestId !== selectSeq) return;
    active = conversations.find(function (x) { return String(x.id) === String(id); }) || active;
    document.querySelector('[data-title]').textContent = other(active).displayName;
  }
  function sharedHub() { return window.__tafseelMessageHub || null; }
  function isHubOwner() { return !window.__tafseelEnsureHub || window.__tafseelEnsureHub === connect; }
  async function disconnectHub() {
    if (!isHubOwner()) { hub = sharedHub(); return; }
    var current = hub || sharedHub();
    hub = null;
    window.__tafseelMessageHub = null;
    if (!current) return;
    try { await current.stop(); } catch (_) { /* ignore */ }
  }
  async function connect() {
    if (!window.__tafseelEnsureHub) window.__tafseelEnsureHub = connect;
    if (window.__tafseelEnsureHub !== connect) return window.__tafseelEnsureHub();
    if (!Tafseel.api.accessToken()) return;
    if (!window.signalR) {
      await new Promise(function (resolve) { setTimeout(resolve, 400); });
      if (!window.signalR) return;
    }
    hub = sharedHub();
    var state = hub && hub.state;
    if (hub && (state === 'Connected' || state === 1)) {
      if (active) await hub.invoke('JoinConversation', active.id).catch(function () {});
      return;
    }
    if (hub && (state === 'Connecting' || state === 'Reconnecting' || state === 0 || state === 2)) return;
    await disconnectHub();
    try {
      var connection = new signalR.HubConnectionBuilder().withUrl('/hubs/messages', { accessTokenFactory: function () { return Tafseel.api.accessToken(); } }).withAutomaticReconnect().build();
      window.__tafseelConnectCount = (window.__tafseelConnectCount || 0) + 1;
      connectCount = window.__tafseelConnectCount;
      connection.on('MessageReceived', function (dto) {
        var incoming = { id: dto.id || dto.Id, conversationId: dto.conversationId || dto.ConversationId, senderId: dto.senderId || dto.SenderId, body: dto.body || dto.Body, createdAt: dto.createdAt || dto.CreatedAt, attachments: dto.attachments || dto.Attachments || [] };
        if (active && String(incoming.conversationId) === String(active.id)) {
          var index = messages.findIndex(function (x) { return String(x.id) === String(incoming.id); });
          if (index >= 0) messages[index] = Object.assign({}, messages[index], incoming); else messages.push(incoming);
          renderMessages();
        }
        loadList().catch(function () {});
      });
      connection.on('NotificationChanged', function () { loadList().catch(function () {}); });
      hub = connection;
      window.__tafseelMessageHub = connection;
      await connection.start();
      if (active) await connection.invoke('JoinConversation', active.id);
    } catch (_) {
      if (window.__tafseelMessageHub === hub) window.__tafseelMessageHub = null;
      hub = null;
    }
  }
  function showError(error) { var node = document.querySelector('[data-chat-status]'); if (node) { node.dataset.kind = 'error'; node.textContent = Tafseel.api.errorMessage(error); } }
  async function open(target) {
    if (!document.querySelector('.tf-chat-widget')) inject();
    var widget = document.querySelector('.tf-chat-widget');
    if (!widget) return;
    widget.dataset.open = 'true';
    try { await loadList(); } catch (error) { showError(error); }
    if (!target) return;
    if (typeof target === 'string') target = { otherUserId: target, scope: 0, resourceId: null };
    if (target.conversationId) return select(target.conversationId);
    active = await Tafseel.api.post('/conversations', { otherUserId: target.otherUserId, scope: target.scope || 0, resourceId: target.resourceId || null });
    await loadList(); await select(active.id);
  }
  async function boot() {
    session = await Tafseel.api.ready();
    if (!session) return false;
    if (document.querySelector('.tf-chat-widget')) {
      window.TafseelChat = window.TafseelChat || { open: open, openOrder: function (orderId, otherUserId) { return open({ otherUserId: otherUserId, scope: 2, resourceId: orderId }); } };
      await (window.__tafseelEnsureHub || connect)();
      return true;
    }
    inject();
    document.querySelector('.tf-chat-launch').onclick = function () { open().catch(showError); };
    document.querySelectorAll('[data-close]').forEach(function (x) { x.onclick = function () { document.querySelector('.tf-chat-widget').dataset.open = 'false'; }; });
    document.querySelector('[data-min]').onclick = function () { document.querySelector('.tf-chat-widget').dataset.open = 'false'; };
    document.querySelector('[data-max]').onclick = function () { var widget = document.querySelector('.tf-chat-widget'); widget.dataset.max = String(widget.dataset.max !== 'true'); };
    document.querySelector('[data-back]').onclick = function () { document.querySelector('.tf-chat-widget').dataset.pane = 'list'; };
    var form = document.querySelector('.tf-chat-compose'), fileInput = form.querySelector('input[type=file]');
    fileInput.onchange = function () { document.querySelector('[data-file-name]').textContent = fileInput.files[0] ? fileInput.files[0].name : ''; };
    form.onsubmit = async function (event) {
      event.preventDefault(); var input = form.querySelector('textarea'), body = input.value.trim(), file = fileInput.files[0], button = form.querySelector('button[type=submit]');
      if (!active || !body || form.dataset.sending === 'true') return;
      form.dataset.sending = 'true'; button.disabled = true; button.setAttribute('aria-busy', 'true'); document.querySelector('[data-chat-status]').textContent = '';
      try {
        var sent = await Tafseel.api.post('/conversations/' + active.id + '/messages', { body: body });
        if (file) { var data = new FormData(); data.append('file', file); await Tafseel.api.upload('/messages/' + sent.id + '/attachments', data); }
        input.value = ''; fileInput.value = ''; document.querySelector('[data-file-name]').textContent = ''; await select(active.id);
      } catch (error) { showError(error); } finally { form.dataset.sending = 'false'; button.disabled = false; button.removeAttribute('aria-busy'); }
    };
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        var openWidget = document.querySelector('.tf-chat-widget');
        if (openWidget) openWidget.dataset.open = 'false';
      }
    });
    window.TafseelChat = { open: open, openOrder: function (orderId, otherUserId) { return open({ otherUserId: otherUserId, scope: 2, resourceId: orderId }); } };
    try { await loadList(); } catch (error) { showError(error); }
    await connect();
    timer = setInterval(function () { if (!hub && document.visibilityState === 'visible') loadList().catch(function () {}); }, 12000);
    var query = new URLSearchParams(location.search), conversationId = query.get('conversationId'), target = query.get('chatWith');
    if (conversationId) open({ conversationId: conversationId }).catch(showError); else if (target) open(target).catch(showError);
    return true;
  }
  if (!window.__tafseelChatLifecycleBound) {
    window.__tafseelChatLifecycleBound = true;
    addEventListener('pagehide', function () {
      clearInterval(timer);
      if (typeof window.__tafseelEnsureHub === 'function') disconnectHub();
    });
    addEventListener('pageshow', function (event) {
      if (event.persisted && typeof window.__tafseelEnsureHub === 'function') window.__tafseelEnsureHub();
    });
  }
  function startBoot() {
    if (window.__tafseelChatStarting) return;
    window.__tafseelChatStarting = true;
    boot().then(function (ok) {
      window.__tafseelChatStarting = false;
      window.__tafseelChatBooted = !!ok;
    }).catch(function () {
      window.__tafseelChatStarting = false;
      window.__tafseelChatBooted = false;
    });
  }
  document.addEventListener('tafseel:auth', function (event) {
    if (event.detail && !document.querySelector('.tf-chat-widget')) startBoot();
  });
  startBoot();
  if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
    window.__tafseelChatDebug = function () {
      var live = window.__tafseelMessageHub || hub;
      var state = live && live.state;
      return {
        connectCount: window.__tafseelConnectCount || connectCount || 0,
        hubState: state === 1 || state === 'Connected' ? 'Connected' : (state === 2 || state === 'Reconnecting' ? 'Reconnecting' : (state === 0 || state === 'Connecting' ? 'Connecting' : (state === 3 || state === 'Disconnected' ? 'Disconnected' : 'none'))),
        hasSharedHub: !!window.__tafseelMessageHub,
        open: !!(document.querySelector('.tf-chat-widget') && document.querySelector('.tf-chat-widget').dataset.open === 'true'),
        widgets: document.querySelectorAll('.tf-chat-widget').length,
        joined: !!(window.__tafseelActiveConversationId || (active && active.id))
      };
    };
  }
})();
