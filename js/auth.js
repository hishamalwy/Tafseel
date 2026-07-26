(function () {
  var loginForm = document.getElementById('login-form');
  var registerForm = document.getElementById('register-form');
  var resetForm = document.getElementById('reset-form');
  var loginTab = document.getElementById('login-tab');
  var registerTab = document.getElementById('register-tab');
  var status = document.getElementById('auth-status');

  function show(which) {
    var login = which === 'login';
    loginForm.hidden = !login;
    registerForm.hidden = login;
    resetForm.hidden = true;
    loginTab.setAttribute('aria-selected', String(login));
    registerTab.setAttribute('aria-selected', String(!login));
    status.textContent = '';
  }
  function message(text, kind) {
    status.textContent = text;
    status.dataset.kind = kind || '';
  }
  function destination(session) {
    if (session.roles.includes('Admin')) return 'Tafseel-Admin-Dashboard.dc.html';
    if (session.roles.includes('QualityReviewer')) return 'Tafseel-Quality-Dashboard.dc.html';
    if (session.roles.includes('Teacher')) return 'Tafseel-Teacher-Dashboard.dc.html';
    return 'Tafseel-Student-Dashboard.dc.html';
  }

  loginTab.addEventListener('click', function () { show('login'); });
  registerTab.addEventListener('click', function () { show('register'); });
  document.getElementById('theme').addEventListener('click', function () { Tafseel.toggleTheme(); });
  loginForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    message('Signing in…');
    try {
      var form = new FormData(loginForm);
      var session = await Tafseel.api.login(form.get('email'), form.get('password'));
      location.href = destination(session);
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  });
  registerForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    message('Creating your account…');
    try {
      var form = new FormData(registerForm);
      await Tafseel.api.register(Object.fromEntries(form));
      show('login');
      message('Account created. Check your email to confirm it, then log in.', 'success');
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  });
  document.getElementById('forgot').addEventListener('click', async function () {
    var email = document.getElementById('login-email').value;
    if (!email) return message('Enter your email first.', 'error');
    try {
      await Tafseel.api.post('/auth/forgot-password', { email: email });
      message('If the account exists, a reset email has been sent.', 'success');
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  });
  resetForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    var query = new URLSearchParams(location.search);
    try {
      await Tafseel.api.post('/auth/reset-password', {
        email:query.get('email'), token:query.get('token'),
        password:document.getElementById('reset-password').value
      });
      show('login');
      message('Password reset. You can log in now.', 'success');
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  });

  (async function () {
    var query = new URLSearchParams(location.search);
    if (query.get('mode') === 'reset' && query.get('email') && query.get('token')) {
      loginForm.hidden = true;
      registerForm.hidden = true;
      resetForm.hidden = false;
      document.querySelector('.tf-auth-tabs').hidden = true;
      document.getElementById('auth-title').textContent = 'Reset your password';
    } else if (query.get('email') && query.get('token')) {
      try {
        await Tafseel.api.post('/auth/confirm-email', {
          email: query.get('email'), token: query.get('token')
        });
        message('Email confirmed. You can log in now.', 'success');
      } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
    }
  })();
})();
