(function () {
  var session = null;
  var conversations = [];
  var active = null;
  var timer = null;
  var list = document.getElementById('conversations');
  var messages = document.getElementById('messages');
  var title = document.getElementById('chat-title');

  function escape(value) {
    var node = document.createElement('div');
    node.textContent = value || '';
    return node.innerHTML;
  }
  async function loadConversations() {
    var page = await Tafseel.api.get('/conversations?pageSize=50');
    conversations = page.items;
    list.innerHTML = conversations.length ? conversations.map(function (x) {
      var other = x.participantIds.find(function (id) { return id !== session.userId; }) || 'Conversation';
      return '<button type="button" data-id="' + x.id + '"><strong>' + escape(other) + '</strong><br><span class="tf-muted">' +
        escape(x.latestMessage && x.latestMessage.body || 'No messages yet') + (x.unreadCount ? ' · ' + x.unreadCount + ' unread' : '') + '</span></button>';
    }).join('') : '<p class="tf-muted">No conversations yet.</p>';
    list.querySelectorAll('button').forEach(function (button) {
      button.addEventListener('click', function () { select(button.dataset.id); });
    });
    if (active) active = conversations.find(function (x) { return x.id === active.id; }) || active;
  }
  async function loadMessages() {
    if (!active) return;
    var page = await Tafseel.api.get('/conversations/' + active.id + '/messages?pageSize=100');
    messages.innerHTML = page.items.map(function (x) {
      return '<div class="tf-message" data-mine="' + (x.senderId === session.userId) + '">' + escape(x.body) + '</div>';
    }).join('');
    messages.scrollTop = messages.scrollHeight;
  }
  async function select(id) {
    active = conversations.find(function (x) { return x.id === id; });
    if (!active) return;
    title.textContent = 'Conversation';
    await loadMessages();
    try {
      await Tafseel.api.post('/conversations/' + active.id + '/read', null, { 'If-Match': active.version });
      await loadConversations();
    } catch (_) {}
  }
  document.getElementById('composer').addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!active) return;
    var input = document.getElementById('message');
    if (!input.value.trim()) return;
    await Tafseel.api.post('/conversations/' + active.id + '/messages', { body: input.value });
    input.value = '';
    await loadConversations();
    await loadMessages();
  });

  (async function () {
    session = await Tafseel.api.ready();
    if (!session) return location.replace('Tafseel-Auth.dc.html');
    var query = new URLSearchParams(location.search);
    try {
      if (query.get('otherUserId')) {
        active = await Tafseel.api.post('/conversations', {
          otherUserId: query.get('otherUserId'), scope: Number(query.get('scope') || 0),
          resourceId: query.get('resourceId') || null
        });
      }
      await loadConversations();
      if (active) await select(active.id);
      else if (conversations[0]) await select(conversations[0].id);
      // ponytail: five-second polling avoids a browser SignalR dependency; replace if chat latency is measured as insufficient.
      timer = setInterval(async function () {
        try { await loadConversations(); await loadMessages(); } catch (_) {}
      }, 5000);
    } catch (error) { title.textContent = Tafseel.api.errorMessage(error); }
  })();
  addEventListener('beforeunload', function () { clearInterval(timer); });
})();
