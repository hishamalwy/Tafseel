(function () {
  'use strict';

  var shell = document.getElementById('auth-shell');
  var tabs = document.getElementById('auth-tabs');
  var loginTab = document.getElementById('login-tab');
  var registerTab = document.getElementById('register-tab');
  var title = document.getElementById('auth-title');
  var subtitle = document.getElementById('auth-subtitle');
  var status = document.getElementById('auth-status');
  var panels = {
    login: document.getElementById('login-form'),
    register: document.getElementById('register-form'),
    forgot: document.getElementById('forgot-form'),
    reset: document.getElementById('reset-form')
  };
  var copy = {
    login: ['Welcome to Tafseel', 'Use one secure account for requests, teaching, reviews, and messages.'],
    register: ['Create your account', 'Choose how you will use Tafseel. You can complete your profile next.'],
    forgot: ['Forgot your password?', 'Enter your email and we will send a secure reset link if the account exists.'],
    reset: ['Choose a new password', 'Set a strong password for your Tafseel account.']
  };
  var activeMode = 'login';

  function message(text, kind) {
    status.textContent = text ? Tafseel.localizeText(text) : '';
    status.dataset.kind = kind || '';
    status.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }

  function show(which, options) {
    if (!panels[which]) which = 'login';
    options = options || {};
    activeMode = which;
    shell.dataset.authMode = which;
    Object.entries(panels).forEach(function (entry) {
      var visible = entry[0] === which;
      entry[1].hidden = !visible;
      entry[1].setAttribute('aria-hidden', String(!visible));
      entry[1].querySelectorAll('input,select,button').forEach(function (control) {
        control.disabled = !visible;
      });
    });

    var tabMode = which === 'login' || which === 'register';
    tabs.hidden = !tabMode;
    loginTab.setAttribute('aria-selected', String(which === 'login'));
    loginTab.tabIndex = which === 'login' ? 0 : -1;
    registerTab.setAttribute('aria-selected', String(which === 'register'));
    registerTab.tabIndex = which === 'register' ? 0 : -1;
    title.textContent = Tafseel.localizeText(copy[which][0]);
    subtitle.textContent = Tafseel.localizeText(copy[which][1]);
    if (!options.keepMessage) message('');
    if (options.focus !== false) {
      var first = panels[which].querySelector('input,select,button');
      if (first) first.focus();
    }
  }

  async function submit(form, pendingText, action) {
    if (panels[activeMode] !== form) return;
    var button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    message(pendingText);
    try {
      await action();
    } catch (error) {
      message(Tafseel.api.errorMessage(error), 'error');
    } finally {
      button.disabled = panels[activeMode] !== form;
      form.removeAttribute('aria-busy');
    }
  }

  function destination(session) {
    if (session.roles.includes('Admin')) return 'Tafseel-Admin-Dashboard.dc.html';
    if (session.roles.includes('QualityReviewer')) return 'Tafseel-Quality-Dashboard.dc.html';
    if (session.roles.includes('Teacher')) return 'Tafseel-Teacher-Dashboard.dc.html';
    return 'Tafseel-Student-Dashboard.dc.html';
  }

  loginTab.addEventListener('click', function () { show('login'); });
  registerTab.addEventListener('click', function () { show('register'); });
  tabs.addEventListener('keydown', function (event) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    var next = event.key === 'ArrowLeft' || event.key === 'Home' ? 'login' : 'register';
    show(next);
    (next === 'login' ? loginTab : registerTab).focus();
  });
  panels.login.addEventListener('submit', function (event) {
    event.preventDefault();
    var form = new FormData(panels.login);
    submit(panels.login, 'Signing in...', async function () {
      var session = await Tafseel.api.login(form.get('email'), form.get('password'));
      location.href = destination(session);
    });
  });

  panels.register.addEventListener('submit', function (event) {
    event.preventDefault();
    var form = new FormData(panels.register);
    submit(panels.register, 'Creating your account...', async function () {
      await Tafseel.api.register(Object.fromEntries(form));
      panels.register.reset();
      show('login');
      message('Account created. Check your email to confirm it, then log in.', 'success');
    });
  });

  document.getElementById('forgot').addEventListener('click', function () {
    document.getElementById('forgot-email').value = document.getElementById('login-email').value;
    show('forgot');
  });
  document.querySelectorAll('[data-back-to-login]').forEach(function (button) {
    button.addEventListener('click', function () { show('login'); });
  });

  panels.forgot.addEventListener('submit', function (event) {
    event.preventDefault();
    var email = new FormData(panels.forgot).get('email');
    submit(panels.forgot, 'Sending reset email...', async function () {
      await Tafseel.api.post('/auth/forgot-password', { email: email });
      message('If the account exists, a reset email has been sent.', 'success');
    });
  });

  panels.reset.addEventListener('submit', function (event) {
    event.preventDefault();
    var query = new URLSearchParams(location.search);
    submit(panels.reset, 'Resetting your password...', async function () {
      await Tafseel.api.post('/auth/reset-password', {
        email: query.get('email'),
        token: query.get('token'),
        password: new FormData(panels.reset).get('password')
      });
      history.replaceState(null, '', location.pathname);
      panels.reset.reset();
      show('login');
      message('Password reset. You can log in now.', 'success');
    });
  });

  (async function initialize() {
    var query = new URLSearchParams(location.search);
    var mode = query.get('mode');
    var email = query.get('email');
    var token = query.get('token');
    if (mode === 'reset') {
      if (email && token) show('reset', { focus: false });
      else {
        show('login', { focus: false });
        message('This password reset link is incomplete or invalid.', 'error');
      }
      return;
    }

    show(mode === 'register' ? 'register' : 'login', { focus: false });
    if (mode === 'confirm' && email && token) {
      message('Confirming your email...');
      try {
        await Tafseel.api.post('/auth/confirm-email', { email: email, token: token });
        history.replaceState(null, '', location.pathname);
        message('Email confirmed. You can log in now.', 'success');
      } catch (error) {
        message(Tafseel.api.errorMessage(error), 'error');
      }
    }
  })();
})();
