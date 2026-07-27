(function () {
  'use strict';

  var session = null;
  var conversations = [];
  var messages = [];
  var active = null;
  var pollTimer = null;
  var hub = null;
  var hubReady = false;
  var sending = false;
  var loadError = '';
  var failedBody = '';
  var pane = 'list';
  var listEl = document.getElementById('conversations');
  var messagesEl = document.getElementById('messages');
  var titleEl = document.getElementById('chat-title');
  var statusEl = document.getElementById('chat-status');
  var shellEl = document.getElementById('chat-shell');
  var composer = document.getElementById('composer');
  var input = document.getElementById('message');
  var sendBtn = document.getElementById('send-btn');
  var backBtn = document.getElementById('chat-back');
  var dashLink = document.getElementById('chat-dashboard');
  var retryBtn = document.getElementById('chat-retry');

  function t(key, values) {
    try { return Tafseel.t(key, values); } catch (_) { return key; }
  }

  function escape(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function otherId(conversation) {
    if (!conversation || !conversation.participantIds) return '';
    return conversation.participantIds.find(function (id) { return id !== session.userId; }) || '';
  }

  function setStatus(text, kind) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.dataset.kind = kind || '';
  }

  function setPane(next) {
    pane = next;
    if (shellEl) shellEl.setAttribute('data-pane', next);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling() {
    stopPolling();
    if (hubReady) return;
    pollTimer = setInterval(function () {
      if (document.visibilityState === 'hidden') return;
      refreshQuiet();
    }, 12000);
  }

  async function refreshQuiet() {
    try {
      await loadConversations({ quiet: true });
      if (active) await loadMessages({ quiet: true });
    } catch (_) {}
  }

  function renderConversations() {
    if (!listEl) return;
    if (loadError && !conversations.length) {
      listEl.innerHTML = '<div class="tf-alert" data-kind="error" role="alert">' + escape(loadError) +
        ' <button type="button" class="tf-button-link" id="list-retry">' + escape(t('chat_retry')) + '</button></div>';
      var lr = document.getElementById('list-retry');
      if (lr) lr.addEventListener('click', function () { boot(true); });
      return;
    }
    if (!conversations.length) {
      listEl.innerHTML = '<p class="tf-empty tf-empty-enter">' + escape(t('chat_no_conversations')) + '</p>';
      return;
    }
    listEl.innerHTML = conversations.map(function (x) {
      var oid = otherId(x);
      var label = Tafseel.participantLabel(oid);
      var initials = Tafseel.participantInitials(oid);
      var preview = (x.latestMessage && x.latestMessage.body) || t('chat_no_messages');
      var unread = x.unreadCount ? '<span class="tf-chat-unread">' + escape(String(x.unreadCount)) + '</span>' : '';
      var activeClass = active && active.id === x.id ? ' is-active' : '';
      var current = active && active.id === x.id ? 'true' : 'false';
      var time = x.updatedAt ? '<span class="tf-muted" style="font-size:11px">' + escape(Tafseel.date(x.updatedAt)) + '</span>' : '';
      return '<button type="button" class="tf-chat-item' + activeClass + '" data-id="' + escape(x.id) + '" aria-current="' + current + '">' +
        '<span class="tf-chat-avatar" aria-hidden="true">' + escape(initials) + '</span>' +
        '<span class="tf-chat-item-meta"><strong>' + escape(label) + unread + '</strong>' +
        '<span class="tf-muted" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escape(preview) + '</span>' +
        time + '</span></button>';
    }).join('');
    listEl.querySelectorAll('button[data-id]').forEach(function (button) {
      button.addEventListener('click', function () { select(button.dataset.id); });
    });
  }

  function renderMessages() {
    if (!messagesEl) return;
    if (!active) {
      messagesEl.innerHTML = '<p class="tf-empty">' + escape(t('chat_select_conversation')) + '</p>';
      return;
    }
    if (!messages.length) {
      messagesEl.innerHTML = '<p class="tf-empty tf-empty-enter">' + escape(t('chat_no_messages')) + '</p>';
      return;
    }
    messagesEl.innerHTML = messages.map(function (x) {
      var mine = x.senderId === session.userId;
      var failed = !!x._failed;
      var meta = x.createdAt ? '<span class="tf-message-meta">' + escape(Tafseel.date(x.createdAt)) + '</span>' : '';
      var retry = failed
        ? '<button type="button" class="tf-button-link" data-retry-body="' + escape(x.body) + '">' + escape(t('chat_retry_send')) + '</button>'
        : '';
      return '<div class="tf-message" data-mine="' + mine + '" data-failed="' + failed + '">' +
        escape(x.body) + meta + retry + '</div>';
    }).join('');
    messagesEl.querySelectorAll('[data-retry-body]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        input.value = btn.getAttribute('data-retry-body') || '';
        sendMessage();
      });
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateTitle() {
    if (!titleEl) return;
    if (!active) {
      titleEl.textContent = t('chat_conversations');
      return;
    }
    titleEl.textContent = Tafseel.participantLabel(otherId(active));
  }

  async function loadConversations(opts) {
    opts = opts || {};
    var page = await Tafseel.api.get('/conversations?pageSize=50');
    conversations = page.items || [];
    loadError = '';
    if (active) active = conversations.find(function (x) { return x.id === active.id; }) || active;
    if (!opts.quiet) renderConversations();
    else renderConversations();
  }

  async function loadMessages(opts) {
    opts = opts || {};
    if (!active) return;
    var page = await Tafseel.api.get('/conversations/' + active.id + '/messages?pageSize=100');
    var incoming = page.items || [];
    // Deduplicate by id when merging with optimistic/failed locals
    var byId = {};
    incoming.forEach(function (m) { byId[m.id] = m; });
    messages.filter(function (m) { return m._failed; }).forEach(function (m) {
      byId['failed-' + m.body] = m;
    });
    messages = Object.keys(byId).map(function (k) { return byId[k]; })
      .sort(function (a, b) {
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });
    renderMessages();
  }

  async function select(id) {
    active = conversations.find(function (x) { return x.id === id; });
    if (!active) return;
    setPane('thread');
    updateTitle();
    messages = [];
    renderMessages();
    setStatus(t('chat_loading'), '');
    try {
      await loadMessages();
      setStatus('');
      try {
        await Tafseel.api.post('/conversations/' + active.id + '/read', null, { 'If-Match': active.version });
        await loadConversations({ quiet: true });
      } catch (_) {}
      if (hubReady && hub) {
        try { await hub.invoke('JoinConversation', active.id); } catch (_) {}
      }
    } catch (error) {
      setStatus(Tafseel.api.errorMessage(error), 'error');
    }
  }

  async function sendMessage() {
    if (!active || sending) return;
    var body = (input.value || '').trim();
    if (!body) return;
    sending = true;
    if (sendBtn) sendBtn.disabled = true;
    setStatus(t('chat_sending'), '');
    try {
      await Tafseel.api.post('/conversations/' + active.id + '/messages', { body: body });
      input.value = '';
      failedBody = '';
      await loadConversations({ quiet: true });
      await loadMessages();
      setStatus('');
    } catch (error) {
      failedBody = body;
      messages.push({ id: 'failed-' + body, body: body, senderId: session.userId, createdAt: new Date().toISOString(), _failed: true });
      renderMessages();
      setStatus(Tafseel.api.errorMessage(error), 'error');
    } finally {
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async function connectHub() {
    if (!window.signalR || !Tafseel.api.accessToken()) return false;
    try {
      hub = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/messages', {
          accessTokenFactory: function () { return Tafseel.api.accessToken(); }
        })
        .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.None)
        .build();

      hub.on('MessageReceived', function (dto) {
        if (!dto) return;
        var cid = String(dto.conversationId || dto.ConversationId || '');
        var mid = dto.id || dto.Id;
        if (active && cid && cid === String(active.id)) {
          if (!messages.some(function (m) { return String(m.id) === String(mid); })) {
            messages.push({
              id: mid,
              conversationId: cid,
              senderId: dto.senderId || dto.SenderId,
              body: dto.body || dto.Body,
              createdAt: dto.createdAt || dto.CreatedAt
            });
            renderMessages();
          }
        }
        loadConversations({ quiet: true }).catch(function () {});
      });
      hub.on('NotificationChanged', function () {
        loadConversations({ quiet: true }).catch(function () {});
      });

      hub.onreconnecting(function () {
        hubReady = false;
        startPolling();
        setStatus(t('chat_reconnecting'), 'warning');
      });
      hub.onreconnected(async function () {
        hubReady = true;
        stopPolling();
        setStatus('');
        if (active) {
          try { await hub.invoke('JoinConversation', active.id); } catch (_) {}
        }
        await refreshQuiet();
      });
      hub.onclose(function () {
        hubReady = false;
        startPolling();
      });

      await hub.start();
      hubReady = true;
      stopPolling();
      if (active) {
        try { await hub.invoke('JoinConversation', active.id); } catch (_) {}
      }
      return true;
    } catch (_) {
      hubReady = false;
      hub = null;
      return false;
    }
  }

  async function disconnectHub() {
    hubReady = false;
    if (hub) {
      try { await hub.stop(); } catch (_) {}
      hub = null;
    }
  }

  if (composer) {
    composer.addEventListener('submit', function (event) {
      event.preventDefault();
      sendMessage();
    });
  }
  if (backBtn) {
    backBtn.addEventListener('click', function () {
      setPane('list');
      active = null;
      updateTitle();
      renderConversations();
    });
  }
  if (retryBtn) {
    retryBtn.addEventListener('click', function () { boot(true); });
  }

  document.addEventListener('tafseel:change', function () {
    updateTitle();
    renderConversations();
    renderMessages();
    if (input) input.placeholder = t('chat_write_message');
    if (sendBtn) sendBtn.textContent = t('chat_send');
    if (backBtn) backBtn.setAttribute('aria-label', t('chat_back'));
  });

  async function boot(isRetry) {
    setStatus(t('chat_loading'), '');
    try {
      await loadConversations();
      var query = new URLSearchParams(location.search);
      if (query.get('otherUserId')) {
        active = await Tafseel.api.post('/conversations', {
          otherUserId: query.get('otherUserId'),
          scope: Number(query.get('scope') || 0),
          resourceId: query.get('resourceId') || null
        });
        await loadConversations({ quiet: true });
      }
      if (active) await select(active.id);
      else if (conversations[0] && window.matchMedia('(min-width: 861px)').matches)
        await select(conversations[0].id);
      else {
        setPane('list');
        updateTitle();
      }
      var connected = await connectHub();
      if (!connected) startPolling();
      setStatus(connected ? '' : t('chat_live_fallback'), connected ? '' : '');
      if (isRetry) setStatus(t('chat_refreshed'), 'success');
    } catch (error) {
      loadError = Tafseel.api.errorMessage(error);
      setStatus(loadError, 'error');
      renderConversations();
      startPolling();
    }
  }

  (async function () {
    session = await Tafseel.api.ready();
    if (!session) return location.replace('Tafseel-Auth.dc.html');
    if (dashLink) {
      dashLink.href = Tafseel.dashboardHrefForSession(session);
      dashLink.textContent = t('chat_back_dashboard');
    }
    if (input) input.placeholder = t('chat_write_message');
    if (sendBtn) sendBtn.textContent = t('chat_send');
    if (backBtn) backBtn.setAttribute('aria-label', t('chat_back'));
    setPane('list');
    await boot(false);
  })();

  addEventListener('beforeunload', function () {
    stopPolling();
    disconnectHub();
  });
  addEventListener('pagehide', function () {
    stopPolling();
    disconnectHub();
  });
})();
