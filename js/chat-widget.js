(function () {
  'use strict';
  var session, conversations = [], active, messages = [], hub, timer;

  function esc(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }
  function other(conversation) {
    return (conversation.participants || []).find(function (x) { return x.userId !== session.userId; })
      || { displayName: 'Tafseel member', initials: 'TM', role: '' };
  }
  function inject() {
    var style = document.createElement('style');
    style.textContent = '.tf-chat-launch{position:fixed;inset-inline-end:22px;inset-block-end:22px;z-index:90;width:52px;height:52px;border:0;border-radius:50%;background:var(--primary);color:var(--primary-ink);box-shadow:var(--shadow-lg);font-size:20px}.tf-chat-badge{position:absolute;inset-block-start:-4px;inset-inline-end:-4px;min-width:20px;height:20px;padding:0 5px;display:none;place-items:center;border-radius:99px;background:var(--danger);color:#fff;font-size:11px;font-weight:800}.tf-chat-widget{position:fixed;inset-inline-end:22px;inset-block-end:86px;z-index:91;width:min(760px,calc(100vw - 32px));height:min(600px,calc(100vh - 120px));display:none;grid-template-columns:260px 1fr;background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);box-shadow:var(--shadow-lg);overflow:hidden}.tf-chat-widget[data-open=true]{display:grid}.tf-chat-widget[data-max=true]{inset:20px;width:calc(100vw - 40px);height:calc(100vh - 40px)}.tf-chat-list{border-inline-end:1px solid var(--border);overflow:auto}.tf-chat-head{min-height:56px;padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:8px}.tf-chat-tools{display:flex;align-items:center}.tf-chat-item{display:flex;width:100%;gap:10px;padding:13px;border:0;border-bottom:1px solid var(--border);background:transparent;text-align:start;color:var(--text)}.tf-chat-item:hover,.tf-chat-item[aria-current=true]{background:var(--surface-2)}.tf-chat-avatar{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-weight:800;flex:none}.tf-chat-thread{display:grid;grid-template-rows:auto 1fr auto;min-width:0}.tf-chat-messages{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:8px}.tf-chat-bubble{max-width:78%;padding:9px 12px;border-radius:14px;background:var(--surface-2);white-space:pre-wrap}.tf-chat-bubble[data-mine=true]{align-self:flex-end;background:var(--primary);color:var(--primary-ink)}.tf-chat-compose{display:flex;gap:8px;padding:12px;border-top:1px solid var(--border)}.tf-chat-compose input{min-width:0;flex:1}.tf-chat-close{border:0;background:transparent;color:var(--muted);font-size:18px}.tf-chat-empty{margin:auto;color:var(--muted);padding:18px;text-align:center}@media(max-width:680px){.tf-chat-widget,.tf-chat-widget[data-max=true]{inset:0;width:100vw;height:100dvh;border-radius:0;grid-template-columns:1fr}.tf-chat-list{display:none}.tf-chat-widget[data-pane=list] .tf-chat-list{display:block}.tf-chat-widget[data-pane=list] .tf-chat-thread{display:none}.tf-chat-back{display:inline!important}[data-max]{display:none}}';
    document.head.appendChild(style);
    var t = function (key, fallback) { return (window.Tafseel && Tafseel.t(key) !== key) ? Tafseel.t(key) : fallback; };
    document.body.insertAdjacentHTML('beforeend',
      '<button class="tf-chat-launch" type="button" aria-label="' + esc(t('chat_messages', 'Messages')) + '">✉<span class="tf-chat-badge" data-badge></span></button>' +
      '<aside class="tf-chat-widget" data-open="false" data-pane="list" aria-label="' + esc(t('chat_messages', 'Messages')) + '">' +
      '<section class="tf-chat-list"><div class="tf-chat-head"><strong>' + esc(t('chat_messages', 'Messages')) + '</strong><button class="tf-chat-close" data-close aria-label="Close">×</button></div><div data-conversations></div></section>' +
      '<section class="tf-chat-thread"><div class="tf-chat-head"><span><button class="tf-chat-close tf-chat-back" data-back style="display:none" aria-label="Back">‹</button> <strong data-title>' + esc(t('chat_conversation', 'Conversation')) + '</strong></span><span class="tf-chat-tools"><button class="tf-chat-close" data-min aria-label="Minimize">−</button><button class="tf-chat-close" data-max aria-label="Maximize">□</button><button class="tf-chat-close" data-close aria-label="Close">×</button></span></div><div class="tf-chat-messages" data-messages><p class="tf-chat-empty">' + esc(t('chat_choose_conversation', 'Choose a conversation')) + '</p></div><form class="tf-chat-compose"><input maxlength="4000" aria-label="Message" placeholder="' + esc(t('chat_write_message', 'Write a message…')) + '"><button class="tf-button" type="submit">' + esc(t('chat_send', 'Send')) + '</button></form></section></aside>');
  }
  function renderList() {
    var root = document.querySelector('[data-conversations]');
    root.innerHTML = conversations.length ? conversations.map(function (x) {
      var person = other(x);
      var latest = x.latestMessage && x.latestMessage.body || 'No messages yet';
      return '<button class="tf-chat-item" data-conversation="' + esc(x.id) + '" aria-current="' + String(active && active.id === x.id) + '"><img class="tf-chat-avatar" src="' + esc(Tafseel.defaultAvatar) + '" alt=""><span><strong>' + esc(person.displayName) + '</strong><small class="tf-muted" style="display:block">' + esc(person.role || '') + '</small><span class="tf-muted">' + esc(latest) + '</span></span></button>';
    }).join('') : '<p class="tf-chat-empty">No conversations yet</p>';
    root.querySelectorAll('[data-conversation]').forEach(function (button) {
      button.onclick = function () { select(button.dataset.conversation); };
    });
  }
  function renderMessages() {
    var root = document.querySelector('[data-messages]');
    root.innerHTML = messages.length ? messages.map(function (x) {
      return '<div class="tf-chat-bubble" data-mine="' + String(x.senderId === session.userId) + '">' + esc(x.body) + '</div>';
    }).join('') : '<p class="tf-chat-empty">No messages yet</p>';
    root.scrollTop = root.scrollHeight;
  }
  async function loadList() {
    var page = await Tafseel.api.get('/conversations?pageSize=50');
    conversations = page.items || [];
    var unread = conversations.reduce(function (sum, x) { return sum + (x.unreadCount || 0); }, 0);
    var badge = document.querySelector('[data-badge]');
    badge.textContent = unread > 99 ? '99+' : String(unread);
    badge.style.display = unread ? 'grid' : 'none';
    if (active) active = conversations.find(function (x) { return x.id === active.id; }) || active;
    renderList();
  }
  async function select(id) {
    active = conversations.find(function (x) { return x.id === id; });
    if (!active) return;
    document.querySelector('.tf-chat-widget').dataset.pane = 'thread';
    document.querySelector('[data-title]').textContent = other(active).displayName;
    var page = await Tafseel.api.get('/conversations/' + id + '/messages?pageSize=100');
    messages = (page.items || []).slice().sort(function (a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    renderMessages();
    Tafseel.api.post('/conversations/' + id + '/read', null, { 'If-Match': active.version }).catch(function () {});
    if (hub) hub.invoke('JoinConversation', id).catch(function () {});
  }
  async function connect() {
    if (!window.signalR || !Tafseel.api.accessToken()) return;
    try {
      hub = new signalR.HubConnectionBuilder().withUrl('/hubs/messages', {
        accessTokenFactory: function () { return Tafseel.api.accessToken(); }
      }).withAutomaticReconnect().build();
      hub.on('MessageReceived', function (dto) {
        if (active && String(dto.conversationId || dto.ConversationId) === String(active.id)) {
          messages.push({ id: dto.id || dto.Id, senderId: dto.senderId || dto.SenderId, body: dto.body || dto.Body, createdAt: dto.createdAt || dto.CreatedAt });
          renderMessages();
        }
        loadList().catch(function () {});
      });
      await hub.start();
    } catch (_) { hub = null; }
  }
  async function open(otherUserId) {
    var widget = document.querySelector('.tf-chat-widget');
    widget.dataset.open = 'true';
    if (otherUserId) {
      active = await Tafseel.api.post('/conversations', { otherUserId: otherUserId, scope: 0, resourceId: null });
      await loadList();
      await select(active.id);
    } else await loadList();
  }
  async function boot() {
    session = await Tafseel.api.ready();
    if (!session) return;
    inject();
    document.querySelector('.tf-chat-launch').onclick = function () { open().catch(function () {}); };
    document.querySelectorAll('[data-close]').forEach(function (x) { x.onclick = function () { document.querySelector('.tf-chat-widget').dataset.open = 'false'; }; });
    document.querySelector('[data-min]').onclick = function () { document.querySelector('.tf-chat-widget').dataset.open = 'false'; };
    document.querySelector('[data-max]').onclick = function () {
      var widget = document.querySelector('.tf-chat-widget');
      widget.dataset.max = String(widget.dataset.max !== 'true');
    };
    document.querySelector('[data-back]').onclick = function () { document.querySelector('.tf-chat-widget').dataset.pane = 'list'; };
    document.querySelector('.tf-chat-compose').onsubmit = async function (event) {
      event.preventDefault();
      var input = this.querySelector('input'), body = input.value.trim();
      if (!active || !body) return;
      await Tafseel.api.post('/conversations/' + active.id + '/messages', { body: body });
      input.value = '';
      await select(active.id);
    };
    await loadList();
    await connect();
    timer = setInterval(function () { if (!hub && document.visibilityState === 'visible') loadList().catch(function () {}); }, 12000);
    var target = new URLSearchParams(location.search).get('chatWith');
    if (target) open(target).catch(function () {});
    window.TafseelChat = { open: open };
  }
  addEventListener('pagehide', function () { clearInterval(timer); if (hub) hub.stop().catch(function () {}); });
  boot().catch(function () {});
})();
