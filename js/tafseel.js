/* Tafseel shared preferences, localization, direction, and locale formatting. */
(function () {
  'use strict';
  if (window.Tafseel && window.Tafseel.__ready) return;

  var LS_THEME = 'tafseel-theme';
  var LS_LANG = 'tafseel-lang';
  var locales = window.TafseelLocales || { en: {}, ar: {} };
  var indexes = { en: new Map(), ar: new Map() };

  Object.keys(locales).forEach(function (locale) {
    Object.keys(locales[locale]).forEach(function (key) {
      indexes[locale].set(locales[locale][key], key);
    });
  });

  function normalized(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function keyFor(value) {
    var text = normalized(value);
    return indexes.en.get(text) || indexes.ar.get(text);
  }

  function replaceText(node, value) {
    var source = node.nodeValue;
    var start = source.match(/^\s*/)[0];
    var end = source.match(/\s*$/)[0];
    var next = start + value + end;
    if (source !== next) node.nodeValue = next;
  }

  var Tafseel = {
    __ready: true,
    theme: 'light',
    lang: 'en',
    _subs: [],
    _observer: null,
    _navInkRoots: [],

    init: function () {
      try {
        this.theme = localStorage.getItem(LS_THEME) || 'light';
        this.lang = localStorage.getItem(LS_LANG) || 'en';
      } catch (_) {}
      if (!['light', 'dark'].includes(this.theme)) this.theme = 'light';
      if (!['en', 'ar'].includes(this.lang)) this.lang = 'en';
      this.apply(false);
      this.observe();
      var self = this;
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function' && typeof setTimeout === 'function') {
        window.addEventListener('resize', function () {
          clearTimeout(self._navInkResizeTimer);
          self._navInkResizeTimer = setTimeout(function () { self.refreshNavInk(); }, 120);
        });
      }
      return this;
    },

    apply: function (persist) {
      var root = document.documentElement;
      root.setAttribute('data-theme', this.theme);
      root.setAttribute('lang', this.lang);
      root.setAttribute('dir', this.lang === 'ar' ? 'rtl' : 'ltr');
      if (persist !== false) {
        try {
          localStorage.setItem(LS_THEME, this.theme);
          localStorage.setItem(LS_LANG, this.lang);
        } catch (_) {}
      }
      this.translate(document);
      this.updateControls();
      this.updateBrandMarks();
      // dir flips (lang toggle) and re-translated labels both change where the
      // active link physically sits — recompute right away.
      this.refreshNavInk();
      this._subs.slice().forEach(function (subscriber) { subscriber(); });
      document.dispatchEvent(new CustomEvent('tafseel:change', {
        detail: { theme: this.theme, lang: this.lang }
      }));
    },

    updateBrandMarks: function () {
      var light = 'assets/brand/tafseel-mark.png';
      var dark = 'assets/brand/tafseel-mark-dark.png';
      var theme = this.theme;
      document.querySelectorAll('img[data-tafseel-mark]').forEach(function (img) {
        var force = (img.getAttribute('data-tafseel-mark-force') || '').toLowerCase();
        var next = force === 'dark' ? dark : force === 'light' ? light : (theme === 'dark' ? dark : light);
        if (img.getAttribute('src') !== next) img.setAttribute('src', next);
      });
    },
    setTheme: function (theme) {
      if (['light', 'dark'].includes(theme)) {
        this.theme = theme;
        this.apply();
      }
    },
    toggleTheme: function () { this.setTheme(this.theme === 'dark' ? 'light' : 'dark'); },
    setLang: function (lang) {
      if (['en', 'ar'].includes(lang)) {
        this.lang = lang;
        this.apply();
      }
    },
    toggleLang: function () { this.setLang(this.lang === 'ar' ? 'en' : 'ar'); },

    themeToggleHtml: function () {
      return ''
        + '<svg class="tf-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 14.3A8.5 8.5 0 0 1 9.7 3 7 7 0 1 0 21 14.3z"/></svg>'
        + '<svg class="tf-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0-5h1v3h-2V2zm0 17h1v3h-2v-3zM2 11h3v2H2v-2zm17 0h3v2h-3v-2zM4.2 4.2l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4zm14.1 14.1 2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4zM19.8 4.2l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1zM5.6 18.4l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1z"/></svg>';
    },

    /** Toast with enter + exit fade. component must expose setState({ toast, toastLeaving }). */
    flash: function (component, msg, holdMs) {
      holdMs = holdMs == null ? 2600 : holdMs;
      component.setState({ toast: msg, toastLeaving: false });
      clearTimeout(component._toastTimer);
      clearTimeout(component._toastExitTimer);
      component._toastTimer = setTimeout(function () {
        component.setState({ toastLeaving: true });
        component._toastExitTimer = setTimeout(function () {
          component.setState({ toast: '', toastLeaving: false });
        }, 180);
      }, holdMs);
    },

    toastClass: function (leaving) {
      return leaving ? 'tf-toast is-leaving' : 'tf-toast';
    },

    /* Positions the sliding underline under the active/hovered nav link.
       Deliberately direction-agnostic: getBoundingClientRect() always returns
       physical (viewport) coordinates, in both ltr and rtl, so the offset
       between the track and the link (t.left - r.left) is already correct on
       screen — it must NOT be negated or re-derived for rtl (see the
       matching .tf-nav-ink rule in tafseel.css, which is anchored at
       physical left:0 for the same reason). Doing that math with
       direction-aware left/offsetLeft assumptions is what used to send the
       ink to the mirrored side of the track on rtl pages. */
    bindNavInk: function (root) {
      if (!root) return;
      var ink = root.querySelector('.tf-nav-ink');
      if (!ink) {
        ink = document.createElement('span');
        ink.className = 'tf-nav-ink';
        ink.setAttribute('aria-hidden', 'true');
        root.appendChild(ink);
      }
      function moveTo(el) {
        if (!el || !root.contains(el)) return;
        var r = root.getBoundingClientRect();
        var t = el.getBoundingClientRect();
        root.style.setProperty('--tf-nav-x', (t.left - r.left) + 'px');
        root.style.setProperty('--tf-nav-w', t.width + 'px');
      }
      function active() {
        return root.querySelector('a.is-active, button.is-active, [aria-current="page"], [aria-selected="true"]')
          || root.querySelector('a, button.tf-nav-link');
      }
      root._tfNavActive = active;
      root._tfMoveNavInk = function (el) { moveTo(el || active()); };
      if (root.dataset.navInkBound) { root._tfMoveNavInk(); return; }
      root.dataset.navInkBound = 'true';
      root.addEventListener('mouseover', function (e) {
        var el = e.target.closest('a, button.tf-nav-link');
        if (el && root.contains(el)) moveTo(el);
      });
      root.addEventListener('mouseleave', function () { moveTo(active()); });
      // Hash/anchor nav (e.g. the Landing page) has no real "active" page —
      // follow the clicked item immediately instead of leaving the ink
      // sitting wherever the first link happened to be.
      root.addEventListener('click', function (e) {
        var el = e.target.closest('a, button.tf-nav-link');
        if (el && root.contains(el)) moveTo(el);
      });
      if (!Tafseel._navInkRoots.includes(root)) Tafseel._navInkRoots.push(root);
      moveTo(active());
    },

    refreshNavInk: function () {
      this._navInkRoots.slice().forEach(function (root) {
        if (!document.documentElement.contains(root)) return;
        if (root._tfMoveNavInk) root._tfMoveNavInk();
      });
    },

    countUp: function (el, to, opts) {
      if (!el) return;
      opts = opts || {};
      var duration = opts.duration || 900;
      var start = performance.now();
      var from = 0;
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || !Number.isFinite(to)) {
        el.textContent = opts.format ? opts.format(to) : String(to);
        return;
      }
      function frame(now) {
        var t = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        var val = Math.round(from + (to - from) * eased);
        el.textContent = opts.format ? opts.format(val) : String(val);
        if (t < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    },

    observeEscrow: function (root) {
      if (!root || root.dataset.escrowBound) return;
      root.dataset.escrowBound = 'true';
      var steps = Array.prototype.slice.call(root.querySelectorAll('.tf-escrow-step'));
      if (!steps.length) return;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          steps.forEach(function (step, i) {
            setTimeout(function () {
              step.classList.add('is-in');
              root.style.setProperty('--tf-escrow-progress', ((i + 1) / steps.length * 100) + '%');
            }, i * 140);
          });
          io.disconnect();
        });
      }, { threshold: 0.35 });
      io.observe(root);
    },

    t: function (keyOrEnglish, values) {
      var key = locales.en[keyOrEnglish] !== undefined ? keyOrEnglish : keyFor(keyOrEnglish);
      if (!key || locales[this.lang][key] === undefined) return '⟦missing:' + keyOrEnglish + '⟧';
      return Object.keys(values || {}).reduce(function (text, name) {
        return text.replaceAll('{' + name + '}', values[name]);
      }, locales[this.lang][key]);
    },

    localizeText: function (value) {
      var key = keyFor(value);
      return key && locales[this.lang][key] !== undefined ? locales[this.lang][key] : value;
    },

    translate: function (scope) {
      if (!scope || !document.body) return;
      var self = this;
      var root = scope === document ? document.documentElement : scope;

      if (root.nodeType === Node.TEXT_NODE) {
        var directKey = keyFor(root.nodeValue);
        if (directKey) replaceText(root, locales[this.lang][directKey]);
        return;
      }

      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var parent = node.parentElement;
        if (!parent || parent.closest('script,style,code,pre,[translate="no"],[data-i18n-skip]')) continue;
        var key = keyFor(node.nodeValue);
        if (key) replaceText(node, locales[self.lang][key]);
      }

      root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (element) {
        ['placeholder', 'title', 'aria-label'].forEach(function (attribute) {
          if (!element.hasAttribute(attribute)) return;
          var key = keyFor(element.getAttribute(attribute));
          if (key) element.setAttribute(attribute, locales[self.lang][key]);
        });
      });

      root.querySelectorAll('[data-i18n]').forEach(function (element) {
        var requested = element.getAttribute('data-i18n');
        var key = locales.en[requested] !== undefined ? requested : keyFor(element.textContent);
        if (key) element.textContent = locales[self.lang][key];
      });
      root.querySelectorAll('[data-i18n-ph]').forEach(function (element) {
        var requested = element.getAttribute('data-i18n-ph');
        var key = locales.en[requested] !== undefined ? requested : keyFor(element.placeholder);
        if (key) element.placeholder = locales[self.lang][key];
      });

      if (scope === document) {
        var titleKey = keyFor(document.title);
        if (titleKey) document.title = locales[this.lang][titleKey];
      }
    },

    observe: function () {
      if (!window.MutationObserver || !document.documentElement) return;
      var self = this;
      this._observer = new MutationObserver(function (changes) {
        changes.forEach(function (change) {
          if (change.type === 'characterData') self.translate(change.target);
          change.addedNodes.forEach(function (node) { self.translate(node); });
        });
      });
      this._observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
    },

    updateControls: function () {
      var self = this;
      var langAria = self.t('admin_switch_language');
      document.querySelectorAll('[data-tafseel-language]').forEach(function (button) {
        button.classList.add('tf-lang-toggle');
        button.textContent = '';
        button.removeAttribute('data-i18n');
        button.setAttribute('aria-label', langAria);
        button.setAttribute('title', langAria);
      });
      document.querySelectorAll('[data-tafseel-theme], .tf-theme-toggle').forEach(function (button) {
        if (!button.querySelector('.tf-icon-moon')) {
          button.classList.add('tf-theme-toggle');
          button.innerHTML = self.themeToggleHtml();
        }
        button.setAttribute('aria-label', self.localizeText('Toggle dark mode') || 'Toggle dark mode');
      });
      document.querySelectorAll('.tf-nav-track').forEach(function (nav) { self.bindNavInk(nav); });
      document.querySelectorAll('[data-escrow-flow]').forEach(function (el) { self.observeEscrow(el); });
      document.querySelectorAll('[data-count-up]').forEach(function (el) {
        var raw = el.getAttribute('data-count-up');
        if (!raw || raw === '' || raw === 'null' || raw === '—' || el.dataset.counted === raw) return;
        var num = Number(raw);
        if (!Number.isFinite(num)) return;
        el.dataset.counted = raw;
        self.countUp(el, num, {
          format: function (v) { return self.number(v); }
        });
      });
    },

    bindControls: function () {
      var self = this;
      document.querySelectorAll('[data-tafseel-language]').forEach(function (button) {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', function () { self.toggleLang(); });
      });
      document.querySelectorAll('[data-tafseel-theme]').forEach(function (button) {
        if (button.dataset.bound) return;
        button.dataset.bound = 'true';
        button.addEventListener('click', function () { self.toggleTheme(); });
      });
      this.updateControls();
    },

    onChange: function (subscriber) { this._subs.push(subscriber); return subscriber; },
    offChange: function (subscriber) {
      this._subs = this._subs.filter(function (candidate) { return candidate !== subscriber; });
    },

    /**
     * Canonical dashboard drawer helpers (Admin / Student / Teacher / Quality).
     * Desktop: static sidebar. Mobile ≤1024: off-canvas drawer with overlay,
     * Escape, body scroll lock, focus return, and aria-expanded.
     */
    installDashboardDrawer: function (component, options) {
      options = options || {};
      var sidebarId = options.sidebarId || 'dash-sidebar';
      var toggleId = options.toggleId || 'dash-drawer-toggle';
      if (!component.state) component.state = {};
      if (typeof component.state.drawer !== 'boolean') component.state.drawer = false;
      if (typeof component.state.compactNav !== 'boolean') component.state.compactNav = false;

      component.openDrawer = function () {
        if (!this.state.compactNav) return;
        this.setState({ drawer: true });
        document.body.style.overflow = 'hidden';
        var self = this;
        setTimeout(function () {
          if (!self.state.drawer) return;
          var first = document.querySelector('#' + sidebarId + ' nav button, #' + sidebarId + ' nav a');
          if (first) first.focus();
        }, 0);
      };

      component.closeDrawer = function () {
        this.setState({ drawer: false });
        document.body.style.overflow = '';
        var toggle = document.getElementById(toggleId);
        if (toggle && this.state.compactNav) toggle.focus();
      };

      component.toggleDrawer = function (e) {
        if (e && typeof e.preventDefault === 'function') e.preventDefault();
        if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
        if (!this.state.compactNav) return;
        if (this.state.drawer) this.closeDrawer();
        else this.openDrawer();
      };

      component._tfDrawerOnKeydown = function (e) {
        if (e.key === 'Escape' && component.state.drawer) component.closeDrawer();
      };
      document.addEventListener('keydown', component._tfDrawerOnKeydown);

      component._tfDrawerMq = window.matchMedia('(max-width: 1024px)');
      component._tfDrawerOnMq = function () {
        var compact = !!component._tfDrawerMq.matches;
        component.setState({ compactNav: compact, drawer: compact ? component.state.drawer : false });
        if (!compact) document.body.style.overflow = '';
      };
      if (component._tfDrawerMq.addEventListener)
        component._tfDrawerMq.addEventListener('change', component._tfDrawerOnMq);
      else if (component._tfDrawerMq.addListener)
        component._tfDrawerMq.addListener(component._tfDrawerOnMq);
      component.setState({ compactNav: !!component._tfDrawerMq.matches });
    },

    uninstallDashboardDrawer: function (component) {
      if (component._tfDrawerOnKeydown)
        document.removeEventListener('keydown', component._tfDrawerOnKeydown);
      if (component._tfDrawerMq && component._tfDrawerOnMq) {
        if (component._tfDrawerMq.removeEventListener)
          component._tfDrawerMq.removeEventListener('change', component._tfDrawerOnMq);
        else if (component._tfDrawerMq.removeListener)
          component._tfDrawerMq.removeListener(component._tfDrawerOnMq);
      }
      document.body.style.overflow = '';
    },

    drawerRenderVals: function (component) {
      var s = component.state || {};
      var open = !!s.drawer;
      return {
        drawer: open,
        drawerState: open ? 'open' : 'closed',
        drawerExpanded: open ? 'true' : 'false',
        drawerToggleLabel: this.t('admin_toggle_nav'),
        headerElevated: open ? 'elevated' : 'default',
        drawerToggleStyle: 'width:36px;height:36px;border:1px solid var(--border);border-radius:var(--r-sm);place-items:center;font-size:14px;' +
          (open ? 'background:var(--primary-soft);border-color:var(--primary);color:var(--primary);' : 'background:var(--surface);color:var(--text);'),
        toggleDrawer: function (e) { component.toggleDrawer(e); },
        closeDrawer: function () { component.closeDrawer(); }
      };
    },

    /** Safe conversation label when API exposes only participant IDs (no display names). */
    participantLabel: function (participantId) {
      var id = String(participantId || '').trim();
      if (!id) return this.t('chat_conversation');
      var short = id.length > 8 ? id.slice(0, 8) : id;
      return this.t('chat_participant', { id: short });
    },

    participantInitials: function (participantId) {
      var id = String(participantId || '').replace(/[^a-zA-Z0-9]/g, '');
      if (id.length >= 2) return id.slice(0, 2).toUpperCase();
      return '··';
    },

    dashboardHrefForSession: function (session) {
      var roles = (session && session.roles) || [];
      if (roles.indexOf('Admin') >= 0) return 'Tafseel-Admin-Dashboard.dc.html';
      if (roles.indexOf('QualityReviewer') >= 0) return 'Tafseel-Quality-Dashboard.dc.html';
      if (roles.indexOf('Teacher') >= 0) return 'Tafseel-Teacher-Dashboard.dc.html';
      if (roles.indexOf('Student') >= 0) return 'Tafseel-Student-Dashboard.dc.html';
      return 'Tafseel-Landing.dc.html';
    },

    number: function (value, options) {
      return new Intl.NumberFormat(this.lang === 'ar' ? 'ar-SA' : 'en-US', options).format(value);
    },
    date: function (value, options) {
      return new Intl.DateTimeFormat(this.lang === 'ar' ? 'ar-SA' : 'en-US', options || {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
    },
    money: function (value) {
      return this.number(value, { style: 'currency', currency: 'SAR', currencyDisplay: 'symbol' });
    }
  };

  window.Tafseel = Tafseel.init();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      Tafseel.bindControls();
      Tafseel.translate(document);
    }, { once: true });
  } else {
    Tafseel.bindControls();
    Tafseel.translate(document);
  }
})();
