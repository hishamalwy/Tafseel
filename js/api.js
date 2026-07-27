/* Tafseel API client. Access tokens stay in memory; refresh tokens are HttpOnly cookies. */
(function () {
  if (!window.Tafseel || window.Tafseel.api) return;

  var base = (window.TAFSEEL_API_BASE || '/api/v1').replace(/\/$/, '');
  var accessToken = '';
  var currentUser = null;
  var refreshing = null;

  function problem(response, body) {
    var error = new Error(body && (body.detail || body.title) || 'Request failed.');
    error.status = response.status;
    error.code = body && body.code || 'request_failed';
    error.errors = body && body.errors || null;
    return error;
  }

  async function parse(response) {
    if (response.status === 204) return null;
    var type = response.headers.get('content-type') || '';
    return type.indexOf('json') >= 0 ? response.json() : response.text();
  }

  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = fetch(base + '/auth/refresh', {
      method: 'POST', credentials: 'include', headers: { Accept: 'application/json' }
    }).then(async function (response) {
      if (!response.ok) throw problem(response, await parse(response));
      var session = await response.json();
      accessToken = session.accessToken;
      currentUser = session;
      document.dispatchEvent(new CustomEvent('tafseel:auth', { detail: session }));
      return session;
    }).finally(function () { refreshing = null; });
    return refreshing;
  }

  async function request(path, options) {
    options = options || {};
    var headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') {
      headers.set('Content-Type', 'application/json');
      options.body = JSON.stringify(options.body);
    }
    headers.set('Accept', 'application/json');
    if (accessToken) headers.set('Authorization', 'Bearer ' + accessToken);
    var response = await fetch(base + path, Object.assign({}, options, {
      headers: headers, credentials: 'include'
    }));
    if (response.status === 401 && !options.noRefresh && path !== '/auth/refresh' && path !== '/auth/login') {
      try {
        await refresh();
        return request(path, Object.assign({}, options, { noRefresh: true }));
      } catch (_) {
        accessToken = '';
        currentUser = null;
      }
    }
    var body = await parse(response);
    if (!response.ok) throw problem(response, body);
    return body;
  }

  Tafseel.api = {
    request: request,
    get: function (path) { return request(path); },
    post: function (path, body, headers) { return request(path, { method: 'POST', body: body, headers: headers }); },
    put: function (path, body, headers) { return request(path, { method: 'PUT', body: body, headers: headers }); },
    patch: function (path, body, headers) { return request(path, { method: 'PATCH', body: body, headers: headers }); },
    delete: function (path, headers) { return request(path, { method: 'DELETE', headers: headers }); },
    upload: function (path, form, headers) { return request(path, { method: 'POST', body: form, headers: headers }); },
    login: async function (email, password) {
      var session = await request('/auth/login', {
        method: 'POST', body: { email: email, password: password }, noRefresh: true
      });
      accessToken = session.accessToken;
      currentUser = session;
      document.dispatchEvent(new CustomEvent('tafseel:auth', { detail: session }));
      return session;
    },
    register: function (input) { return request('/auth/register', { method: 'POST', body: input, noRefresh: true }); },
    ready: async function () {
      if (currentUser) return currentUser;
      try { return await refresh(); } catch (_) { return null; }
    },
    requireSession: async function (redirect) {
      var session = await this.ready();
      if (!session) {
        location.replace(redirect || 'Tafseel-Auth.dc.html');
        return null;
      }
      return session;
    },
    requireRoles: async function (roles, redirect) {
      var session = await this.requireSession(redirect);
      if (!session) return null;
      var allowed = Array.isArray(roles) ? roles : [roles];
      var ok = (session.roles || []).some(function (role) { return allowed.indexOf(role) >= 0; });
      if (!ok) {
        location.replace(redirect || 'Tafseel-Auth.dc.html');
        return null;
      }
      return session;
    },
    me: function () { return currentUser; },
    /** In-memory access token for authenticated realtime clients (never log or persist). */
    accessToken: function () { return accessToken || ''; },
    logout: async function () {
      try { await request('/auth/logout', { method: 'POST', noRefresh: true }); } finally {
        accessToken = '';
        currentUser = null;
        document.dispatchEvent(new CustomEvent('tafseel:auth', { detail: null }));
      }
    },
    query: function (values) {
      var query = new URLSearchParams();
      Object.keys(values).forEach(function (key) {
        var value = values[key];
        if (value !== undefined && value !== null && value !== '') query.append(key, value);
      });
      var text = query.toString();
      return text ? '?' + text : '';
    },
    errorMessage: function (error) {
      if (error && error.errors) {
        var first = Object.values(error.errors)[0];
        if (Array.isArray(first) && first[0]) return first[0];
      }
      return error && error.message || 'Something went wrong.';
    }
  };
})();
