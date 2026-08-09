/* Tafseel shared preferences, localization, direction, and locale formatting. */
(function () {
  'use strict';
  if (window.Tafseel && window.Tafseel.__ready && window.Tafseel.__build === 'r3s6') return;

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

  // querySelectorAll only matches descendants, never the root itself. The MutationObserver
  // in observe() calls translate() directly on newly-added nodes, so a translatable leaf
  // element (e.g. an <input data-i18n-ph> mounted with no children) inserted after the initial
  // translate(document) pass was silently never translated - it has no descendants for
  // querySelectorAll to find, and it is never revisited. This finds root itself too.
  function selfAndDescendants(root, selector) {
    var matches = root.nodeType === Node.ELEMENT_NODE && root.matches(selector) ? [root] : [];
    if (root.querySelectorAll) matches = matches.concat(Array.prototype.slice.call(root.querySelectorAll(selector)));
    return matches;
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
    __build: 'r3s6',
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
        window.addEventListener('hashchange', function () {
          self.refreshNavInk();
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
      if (this._updatingMarks) return;
      var light = 'assets/brand/tafseel-mark.png';
      var dark = 'assets/brand/tafseel-mark-dark.png';
      var theme = this.theme;
      this._updatingMarks = true;
      try {
        document.querySelectorAll('img[data-tafseel-mark]').forEach(function (img) {
          var force = (img.getAttribute('data-tafseel-mark-force') || '').toLowerCase();
          var next = force === 'dark' ? dark : force === 'light' ? light : (theme === 'dark' ? dark : light);
          if (img.getAttribute('src') !== next) img.setAttribute('src', next);
        });
      } finally {
        this._updatingMarks = false;
      }
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

    analytics: {
      track: function (eventName, sourceSurface, dimensions, dedupeKey) {
        dimensions = dimensions || {};
        try {
          var sessionKey = 'tafseel-analytics-session';
          var sessionId = sessionStorage.getItem(sessionKey);
          if (!sessionId) {
            sessionId = crypto.randomUUID();
            sessionStorage.setItem(sessionKey, sessionId);
          }
          if (dedupeKey) {
            var storedKey = 'tafseel-analytics-dedupe:' + eventName + ':' + dedupeKey;
            if (sessionStorage.getItem(storedKey)) return Promise.resolve(false);
            sessionStorage.setItem(storedKey, '1');
          }
          return Tafseel.api.post('/marketplace-intelligence/events', Object.assign({}, dimensions, {
            eventName: eventName,
            sourceSurface: sourceSurface,
            clientEventId: crypto.randomUUID(),
            anonymousSessionId: sessionId
          })).then(function () { return true; }).catch(function () { return false; });
        } catch (_) {
          return Promise.resolve(false);
        }
      }
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
      function navItems() {
        return Array.prototype.slice.call(root.querySelectorAll('a, button.tf-nav-link'));
      }
      function clearCurrent() {
        navItems().forEach(function (item) {
          item.classList.remove('is-active');
          if (item.dataset.tfNavCurrent === 'true') delete item.dataset.tfNavCurrent;
        });
      }
      function setCurrent(el) {
        if (!el || !root.contains(el)) return;
        clearCurrent();
        el.classList.add('is-active');
        el.dataset.tfNavCurrent = 'true';
      }
      function samePath(url) {
        return url && url.origin === window.location.origin && url.pathname === window.location.pathname;
      }
      function findLocationCurrent() {
        var hash = window.location.hash || '';
        var items = navItems();
        if (hash) {
          for (var i = 0; i < items.length; i++) {
            var href = items[i].getAttribute('href');
            if (!href || href.charAt(0) !== '#') continue;
            if (href === hash) return items[i];
          }
        }
        for (var j = 0; j < items.length; j++) {
          var item = items[j];
          var rawHref = item.getAttribute('href');
          if (!rawHref || rawHref.charAt(0) === '#') continue;
          try {
            var url = new URL(rawHref, window.location.href);
            if (!samePath(url)) continue;
            if (!url.hash || url.hash === hash) return item;
          } catch (_) {}
        }
        return null;
      }
      function moveTo(el) {
        if (!el || !root.contains(el)) {
          root.style.setProperty('--tf-nav-w', '0px');
          return;
        }
        var r = root.getBoundingClientRect();
        var t = el.getBoundingClientRect();
        root.style.setProperty('--tf-nav-x', (t.left - r.left) + 'px');
        root.style.setProperty('--tf-nav-w', t.width + 'px');
      }
      function active() {
        var manual = root.querySelector('[data-tf-nav-current="true"], a.is-active, button.is-active');
        if (manual) return manual;
        return root.querySelector('[aria-current="page"], [aria-selected="true"]') || findLocationCurrent();
      }
      root._tfNavActive = active;
      root._tfMoveNavInk = function (el) {
        // Skip the resync while the pointer is hovering the nav — this runs on
        // every re-render (e.g. the hero's rotating word ticks every ~2.6s),
        // and without this guard it was yanking the ink back to the "current"
        // link out from under a live hover every few seconds, which read as
        // the underline randomly glitching/lagging while browsing the menu.
        if (!el && root._tfHovering) return;
        var current = active();
        if (current && current.dataset.tfNavCurrent !== 'true' && !current.classList.contains('is-active')) {
          setCurrent(current);
          current = active();
        }
        moveTo(el || current);
      };
      if (root.dataset.navInkBound) { root._tfMoveNavInk(); return; }
      root.dataset.navInkBound = 'true';
      root.addEventListener('mouseover', function (e) {
        var el = e.target.closest('a, button.tf-nav-link');
        if (el && root.contains(el)) { root._tfHovering = true; moveTo(el); }
      });
      root.addEventListener('mouseleave', function () { root._tfHovering = false; moveTo(active()); });
      // Hash/anchor nav (e.g. the Landing page) has no real "active" page —
      // follow the clicked item immediately instead of leaving the ink
      // sitting wherever the first link happened to be.
      root.addEventListener('click', function (e) {
        var el = e.target.closest('a, button.tf-nav-link');
        if (!el || !root.contains(el)) return;
        setCurrent(el);
        moveTo(el);
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

    observeReveals: function () {
      var targets = [];
      document.querySelectorAll('[data-reveal]').forEach(function (el) { targets.push(el); });
      document.querySelectorAll('[data-reveal-group]').forEach(function (group) {
        Array.prototype.forEach.call(group.children, function (child, i) {
          child.style.setProperty('--tf-reveal-i', String(i));
          targets.push(child);
        });
      });
      var pending = targets.filter(function (el) { return !el.dataset.revealBound; });
      if (!pending.length) return;
      pending.forEach(function (el) { el.dataset.revealBound = 'true'; });
      document.documentElement.classList.add('tf-reveal-on');
      var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced || !('IntersectionObserver' in window)) {
        pending.forEach(function (el) { el.classList.add('is-in'); });
        return;
      }
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        });
      }, { threshold: 0.05, rootMargin: '0px 0px 12% 0px' });
      pending.forEach(function (el) { io.observe(el); });
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

    languageLabel: function (language) {
      var code = String(language && (language.code || language.detail) || '').toLowerCase();
      if (code === 'ar') return this.lang === 'ar' ? 'العربية' : 'Arabic';
      if (code === 'en') return this.lang === 'ar' ? 'الإنجليزية' : 'English';
      return language && language.name || code;
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

      selfAndDescendants(root, '[placeholder],[title],[aria-label]').forEach(function (element) {
        ['placeholder', 'title', 'aria-label'].forEach(function (attribute) {
          if (!element.hasAttribute(attribute)) return;
          var current = element.getAttribute(attribute);
          var key = keyFor(current);
          var next = key && locales[self.lang][key];
          // Guard against a no-op re-write: setAttribute fires a MutationObserver record even when
          // the value is unchanged, and this attribute is itself observed (see observe() below) so
          // an unconditional write would self-trigger forever.
          if (next && next !== current) element.setAttribute(attribute, next);
        });
      });

      selfAndDescendants(root, '[data-i18n]').forEach(function (element) {
        var requested = element.getAttribute('data-i18n');
        var key = locales.en[requested] !== undefined ? requested : keyFor(element.textContent);
        if (key) element.textContent = locales[self.lang][key];
      });
      selfAndDescendants(root, '[data-i18n-ph]').forEach(function (element) {
        var requested = element.getAttribute('data-i18n-ph');
        var key = locales.en[requested] !== undefined ? requested : keyFor(element.placeholder);
        var next = key && locales[self.lang][key];
        if (next && next !== element.placeholder) element.placeholder = next;
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
        var needsMarks = false;
        var needsControls = false;
        changes.forEach(function (change) {
          if (change.type === 'characterData') self.translate(change.target);
          change.addedNodes.forEach(function (node) { self.translate(node); });
          // A later render (React reconciliation, DC-runtime commit, etc.) can rewrite
          // placeholder/title/aria-label back to their untranslated source value well after the
          // initial translate() pass already ran - proven live via react-dom.production.min.js
          // resetting a translated <input placeholder> ~200ms after mount. Re-translate just that
          // element when one of these three attributes changes; the != current-value guard in
          // translate() above prevents this from ever looping.
          if (change.type === 'attributes' &&
              ['placeholder', 'title', 'aria-label'].indexOf(change.attributeName) !== -1) {
            self.translate(change.target);
          }
          if (change.type === 'attributes' && change.attributeName === 'src' &&
              change.target && change.target.matches && change.target.matches('img[data-tafseel-mark]')) {
            needsMarks = true;
          }
          change.addedNodes.forEach(function (node) {
            if (!node || node.nodeType !== 1) return;
            if ((node.matches && node.matches('img[data-tafseel-mark]')) ||
                (node.querySelectorAll && node.querySelectorAll('img[data-tafseel-mark]').length)) {
              needsMarks = true;
            }
            if ((node.matches && node.matches('.tf-theme-toggle, [data-tafseel-theme]')) ||
                (node.querySelectorAll && node.querySelectorAll('.tf-theme-toggle, [data-tafseel-theme]').length)) {
              needsControls = true;
            }
          });
          if (change.type === 'childList' && change.target && change.target.matches &&
              change.target.matches('.tf-theme-toggle, [data-tafseel-theme]') &&
              !change.target.querySelector('.tf-icon-moon')) {
            needsControls = true;
          }
        });
        if (needsMarks) self.updateBrandMarks();
        if (needsControls) self.updateControls();
      });
      this._observer.observe(document.documentElement, {
        childList: true,
        characterData: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['src', 'placeholder', 'title', 'aria-label']
      });
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
      document.querySelectorAll('[data-public-menu-toggle]').forEach(function (button) {
        button.setAttribute('aria-label', self.t('admin_toggle_nav'));
        button.setAttribute('title', self.t('admin_toggle_nav'));
        if (!button.textContent.trim()) button.textContent = '☰';
      });
      document.querySelectorAll('[data-escrow-flow]').forEach(function (el) { self.observeEscrow(el); });
      self.observeReveals();
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
      self.bindAvatarFallbacks(document);
    },

    setPublicMenu: function (menu, toggle, open) {
      if (!menu) return;
      menu.setAttribute('data-public-menu', open ? 'open' : 'closed');
      if (toggle) {
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        toggle.textContent = open ? '✕' : '☰';
      }
      if (!open) return;
      var first = menu.querySelector('a, button');
      if (first) setTimeout(function () { first.focus(); }, 0);
    },

    closeAllPublicMenus: function () {
      var self = this;
      document.querySelectorAll('[data-public-menu="open"]').forEach(function (menu) {
        var id = menu.id;
        var toggle = id
          ? document.querySelector('[data-public-menu-toggle][aria-controls="' + id + '"]')
          : document.querySelector('[data-public-menu-toggle][aria-expanded="true"]');
        self.setPublicMenu(menu, toggle, false);
      });
    },

    bindPublicMenus: function () {
      if (this._publicMenuBound) return;
      this._publicMenuBound = true;
      var self = this;

      document.addEventListener('click', function (e) {
        var toggle = e.target.closest('[data-public-menu-toggle]');
        if (toggle) {
          e.preventDefault();
          e.stopPropagation();
          var id = toggle.getAttribute('aria-controls');
          var menu = id ? document.getElementById(id) : null;
          if (!menu) {
            var header = toggle.closest('header');
            menu = header ? header.querySelector('[data-public-menu]') : null;
          }
          if (!menu) return;
          var open = menu.getAttribute('data-public-menu') !== 'open';
          if (open) self.closeAllPublicMenus();
          self.setPublicMenu(menu, toggle, open);
          return;
        }
        if (e.target.closest('[data-public-menu] a')) {
          self.closeAllPublicMenus();
          return;
        }
        if (!e.target.closest('[data-public-menu]') && !e.target.closest('[data-public-menu-toggle]')) {
          self.closeAllPublicMenus();
        }
      });

      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') self.closeAllPublicMenus();
      });

      if (typeof window.matchMedia === 'function') {
        var mq = window.matchMedia('(max-width: 860px)');
        var onMq = function () { if (!mq.matches) self.closeAllPublicMenus(); };
        if (mq.addEventListener) mq.addEventListener('change', onMq);
        else if (mq.addListener) mq.addListener(onMq);
      }
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
      this.bindPublicMenus();
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

      if (typeof window.matchMedia === 'function') {
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
      }
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

    /**
     * Safe conversation peer label. Never interpolates user IDs / GUID fragments.
     * Prefer participant.displayName from the API; otherwise localized unavailable.
     */
    participantLabel: function (participantOrId) {
      if (participantOrId && typeof participantOrId === 'object') {
        var fromDto = this.partyDisplayName(participantOrId.displayName, participantOrId.displayNameEnglish);
        if (fromDto) return fromDto;
        return this.t('name_unavailable');
      }
      return this.t('name_unavailable');
    },

    participantInitials: function (participantOrId) {
      var label = '';
      if (participantOrId && typeof participantOrId === 'object')
        label = this.partyDisplayName(participantOrId.displayName, participantOrId.displayNameEnglish) || '';
      else if (typeof participantOrId === 'string' && !this.looksLikeInternalId(participantOrId))
        label = participantOrId;
      var parts = String(label || '').trim().split(/\s+/).filter(Boolean);
      var initials = parts.slice(0, 2).map(function (part) {
        return Array.from(part)[0] || '';
      }).join('');
      return initials ? initials.toLocaleUpperCase() : '··';
    },

    /** True when a string looks like a user/order/request GUID or GUID prefix. */
    looksLikeInternalId: function (value) {
      var text = String(value || '').trim();
      if (!text) return false;
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text))
        return true;
      if (/^[0-9a-f]{8}$/i.test(text)) return true;
      return false;
    },

    /** Canonical person-name rule for raw bilingual fields (never IDs). */
    partyDisplayName: function (primary, english) {
      var isEn = this.lang === 'en';
      var en = String(english || '').trim();
      var ar = String(primary || '').trim();
      if (this.looksLikeInternalId(en)) en = '';
      if (this.looksLikeInternalId(ar)) ar = '';
      if (isEn && en) return en;
      if (ar) return ar;
      if (en) return en;
      return '';
    },

    defaultAvatar: 'assets/brand/default-avatar.svg?v=premium-1',

    avatarUrl: function (userId, hasAvatar, version) {
      if (hasAvatar && userId) {
        var base = (window.TAFSEEL_API_BASE || '/api/v1').replace(/\/$/, '');
        var url = base + '/users/' + encodeURIComponent(userId) + '/avatar';
        if (version != null && version !== '')
          url += (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(version);
        return url;
      }
      return this.defaultAvatar;
    },

    bindAvatarFallbacks: function (root) {
      var self = this;
      var scope = root && root.querySelectorAll ? root : document;
      scope.querySelectorAll('img.tf-img-avatar, img[data-tf-avatar]').forEach(function (img) {
        if (img.dataset.tfAvatarBound === '1') return;
        img.dataset.tfAvatarBound = '1';
        img.addEventListener('error', function () {
          var fallback = self.defaultAvatar;
          if (!img.getAttribute('src') || img.getAttribute('src').indexOf(fallback) === -1) {
            img.src = fallback;
          }
        });
        var src = img.getAttribute('src') || '';
        if (!src || src.indexOf('{{') >= 0 || src === 'null' || src === 'undefined') {
          img.src = self.defaultAvatar;
        }
      });
    },

    userName: function (user) {
      if (!user) return '';
      return this.partyDisplayName(user.fullName || user.name, user.fullNameEnglish)
        || this.t('name_unavailable');
    },

    /** Prefer localized display name fields from list DTOs; never show raw user IDs. */
    partyName: function (dto, role) {
      if (!dto) return this.t('name_unavailable');
      var primary;
      var english;
      if (role === 'student') {
        primary = dto.studentDisplayName;
        english = dto.studentDisplayNameEnglish;
      } else {
        primary = dto.teacherDisplayName;
        english = dto.teacherDisplayNameEnglish;
      }
      return this.partyDisplayName(primary, english) || this.t('name_unavailable');
    },

    /** Localized business title; never Order/Request GUID. */
    orderTitle: function (dto) {
      if (!dto) return this.t('td_order');
      var title = String(dto.requestTitle || dto.title || '').trim();
      if (title && !this.looksLikeInternalId(title)) return title;
      return this.t('td_order');
    },

    requestTitle: function (dto) {
      if (!dto) return this.t('dash_service_learning_request');
      var title = String(dto.title || dto.requestTitle || '').trim();
      if (title && !this.looksLikeInternalId(title)) return title;
      return this.t('dash_service_learning_request');
    },

    /**
     * Canonical Student dashboard projection.
     * Pending Requests = open LearningRequests with no Order.
     * Orders = canonical Order rows only.
     * Completed = completed Orders only (never Accepted request + Order pairs).
     */
    projectStudentWorkList: function (requestItems, orderItems) {
      var self = this;
      var orders = Array.isArray(orderItems) ? orderItems : [];
      var linked = Object.create(null);
      orders.forEach(function (order) {
        if (!order || order.learningRequestId == null) return;
        linked[String(order.learningRequestId).toLowerCase()] = true;
      });

      var pendingRequests = (Array.isArray(requestItems) ? requestItems : [])
        .filter(function (req) {
          if (!req) return false;
          var status = Number(req.status);
          // Only teacher-pending / clarification — Accepted continues as Order.
          if (status !== 0 && status !== 1) return false;
          return !linked[String(req.id).toLowerCase()];
        })
        .map(function (x) {
          return {
            id: x.id,
            learningRequestId: x.id,
            title: self.requestTitle(x),
            service: self.t('dash_service_learning_request'),
            teacher: self.partyName(x, 'teacher'),
            status: self.requestStatusLabel(x.status),
            deadline: self.date(x.preferredDeliveryAt, { dateStyle: 'medium' }),
            amount: x.budget != null ? self.money(x.budget, 'SAR') : self.t('td_budget_flexible'),
            group: 'pending',
            kind: 'request',
            rawStatus: x.status,
            version: x.version,
            studentTotal: 0,
            currency: 'SAR',
            paymentStatus: null
          };
        });

      var orderRows = orders.map(function (x) {
        var status = Number(x.status);
        var hasReview = !!x.hasReview;
        var reviewCanSubmit = x.reviewCanSubmit === true
          || (status === 4 && Number(x.paymentStatus) === 1 && !hasReview);
        var presentation = self.orderPresentation(status, x.paymentStatus, 'student', {
          hasReview: hasReview,
          reviewCanSubmit: reviewCanSubmit
        });
        var group = (status === 4 || status === 5) ? 'done' : (presentation.action ? 'action' : 'active');
        var isAr = self.lang === 'ar';
        var serviceName = (isAr && x.serviceNameArabic)
          ? x.serviceNameArabic
          : (x.serviceNameEnglish || x.serviceNameArabic || self.t('dash_service_personalized'));
        var teacherId = x.teacherId || '';
        var allowance = Number(x.revisionAllowance) || 0;
        var used = Number(x.revisionsUsed) || 0;
        var remaining = Math.max(0, allowance - used);
        var guideKey = 'order_guide_' + presentation.stage;
        if (status === 4 && hasReview) guideKey = 'order_guide_completed_reviewed';
        else if (status === 4 && Number(x.paymentStatus) === 3) guideKey = 'order_guide_completed_refunded';
        return {
          id: x.id,
          learningRequestId: x.learningRequestId,
          teacherId: teacherId,
          title: self.orderTitle(x),
          service: serviceName,
          teacher: self.partyName(x, 'teacher'),
          teacherAvatar: self.avatarUrl(teacherId, false),
          status: self.t(presentation.labelKey),
          stage: presentation.stage,
          action: presentation.action,
          guideKey: guideKey,
          deadline: self.date(x.agreedDeliveryAt, { dateStyle: 'medium' }),
          amount: self.money(x.studentTotal, x.currency || 'SAR'),
          orderRef: String(x.id || '').slice(0, 8),
          requestRef: x.learningRequestId ? String(x.learningRequestId).slice(0, 8) : '',
          categoryCode: x.categoryCode || '',
          revisionAllowance: allowance,
          revisionsUsed: used,
          revisionsRemaining: remaining,
          group: group,
          kind: 'order',
          rawStatus: status,
          paymentStatus: x.paymentStatus,
          version: x.version,
          studentTotal: Number(x.studentTotal) || 0,
          currency: x.currency || 'SAR',
          deliveries: x.deliveries || [],
          hasReview: hasReview,
          reviewOverallScore: x.reviewOverallScore != null ? Number(x.reviewOverallScore) : null,
          reviewComment: x.reviewComment || '',
          reviewIsVisible: x.reviewIsVisible,
          reviewCreatedAt: x.reviewCreatedAt || null,
          reviewCanSubmit: reviewCanSubmit,
          profileHref: teacherId
            ? ('Tafseel-Teacher-Profile.dc.html?id=' + encodeURIComponent(teacherId))
            : ''
        };
      });

      return pendingRequests.concat(orderRows);
    },

    /** Filter projected student work rows by canonical UX buckets. */
    filterStudentWorkList: function (rows, filterKey) {
      var list = Array.isArray(rows) ? rows : [];
      switch (filterKey) {
        case 'pending':
          return list.filter(function (r) { return r.kind === 'request'; });
        case 'orders':
          return list.filter(function (r) { return r.kind === 'order' && r.group !== 'done'; });
        case 'action':
          return list.filter(function (r) { return r.group === 'action'; });
        case 'active':
          return list.filter(function (r) {
            return r.kind === 'request' || (r.kind === 'order' && r.group === 'active');
          });
        case 'done':
          return list.filter(function (r) {
            return r.kind === 'order' && (r.group === 'done' || Number(r.rawStatus) === 4 || Number(r.rawStatus) === 5);
          });
        case 'learning_active':
          return list.filter(function (r) {
            return r.kind === 'order' && (r.group === 'action' || r.group === 'active');
          });
        case 'learning_requests':
          return list.filter(function (r) { return r.kind === 'request'; });
        case 'learning_done':
          return list.filter(function (r) {
            return r.kind === 'order' && (r.group === 'done' || Number(r.rawStatus) === 4 || Number(r.rawStatus) === 5);
          });
        case 'all':
        default:
          return list.filter(function (r) {
            return r.kind === 'request' || (r.kind === 'order' && r.group !== 'done');
          });
      }
    },

    /**
     * Student attention items from canonical work rows + sessions + unread chats.
     * Truth-backed only. Does not invent statuses.
     * opts: { sessions, conversations }
     * Returns array of { id, kind, title, subtitle, meta, ctaKey, priority, row?, session?, conversation? }
     */
    projectStudentAttentionItems: function (workRows, opts) {
      var self = this;
      var rows = Array.isArray(workRows) ? workRows : [];
      var options = opts || {};
      var sessions = Array.isArray(options.sessions) ? options.sessions : [];
      var conversations = Array.isArray(options.conversations) ? options.conversations : [];
      var items = [];
      var now = Date.now();

      rows.forEach(function (row) {
        if (!row) return;
        if (row.kind === 'order' && row.action === 'pay') {
          items.push({
            id: 'attention-pay-' + row.id,
            kind: 'awaiting_payment',
            title: row.title || self.t('td_order'),
            subtitle: row.teacher || '',
            meta: row.amount || '',
            ctaKey: 'sd_attention_cta_pay',
            priority: 10,
            row: row
          });
        } else if (row.kind === 'order' && row.action === 'review') {
          items.push({
            id: 'attention-review-' + row.id,
            kind: 'delivery_ready',
            title: row.title || self.t('td_order'),
            subtitle: row.teacher || '',
            meta: row.deadline || row.status || '',
            ctaKey: 'sd_attention_cta_review',
            priority: 20,
            row: row
          });
        } else if (row.kind === 'request' && Number(row.rawStatus) === 1) {
          items.push({
            id: 'attention-request-' + row.id,
            kind: 'request_action',
            title: row.title || self.t('dash_service_learning_request'),
            subtitle: row.teacher || '',
            meta: row.status || '',
            ctaKey: 'sd_attention_cta_request',
            priority: 25,
            row: row
          });
        } else if (row.kind === 'order' && row.action === 'rate') {
          items.push({
            id: 'attention-rate-' + row.id,
            kind: 'rate_available',
            title: row.title || self.t('td_order'),
            subtitle: row.teacher || '',
            meta: row.amount || '',
            ctaKey: 'sd_attention_cta_rate',
            priority: 30,
            row: row
          });
        }
      });

      conversations
        .filter(function (c) { return c && Number(c.unreadCount) > 0; })
        .slice(0, 3)
        .forEach(function (c) {
          var peer = null;
          if (Array.isArray(c.participants) && c.participants.length) {
            peer = c.participants.find(function (p) {
              return p && self.participantLabel(p) !== self.t('name_unavailable');
            }) || c.participants[0];
          }
          var preview = (c.latestMessage && c.latestMessage.body) || '';
          items.push({
            id: 'attention-msg-' + c.id,
            kind: 'teacher_message',
            title: self.participantLabel(peer || {}),
            subtitle: preview,
            meta: String(c.unreadCount),
            ctaKey: 'sd_attention_cta_message',
            priority: 40,
            conversation: c
          });
        });

      sessions
        .filter(function (s) {
          if (!s || !s.startsAt) return false;
          var start = new Date(s.startsAt).getTime();
          return !isNaN(start) && start >= now;
        })
        .slice(0, 3)
        .forEach(function (s) {
          items.push({
            id: 'attention-session-' + s.id,
            kind: 'upcoming_session',
            title: String(s.title || '').trim() || self.t('dash_stat_sessions'),
            subtitle: self.partyName(s, 'teacher'),
            meta: self.date(s.startsAt),
            ctaKey: 'sd_attention_cta_session',
            priority: 50,
            session: s
          });
        });

      items.sort(function (a, b) { return a.priority - b.priority; });
      return items;
    },

    /**
     * Canonical notification → destination for Student, Teacher, Quality, and Admin.
     * Uses persisted Type + Link only. Never invents targets. Unknown → safe dashboard.
     * Returns { href, section, filter, orderId, focus, conversationId, selectedId, external }.
     */
    notificationRoute: function (notification, role) {
      var type = String((notification && notification.type) || '').toLowerCase();
      var link = String((notification && notification.link) || '');
      var normalizedRole = String(role || '').toLowerCase();
      var who = normalizedRole === 'teacher' ? 'teacher'
        : (normalizedRole === 'quality' || normalizedRole === 'qualityreviewer') ? 'quality'
        : normalizedRole === 'admin' ? 'admin'
        : 'student';
      var orderMatch = link.match(/\/orders\/([0-9a-fA-F-]{36})/);
      var conversationMatch = link.match(/\/conversations\/([0-9a-fA-F-]{36})/);
      var sessionMatch = link.match(/\/live-sessions\/([0-9a-fA-F-]{36})/);
      var selectedMatch = link.match(/[?&](?:selectedId|reviewId|applicationId)=([0-9a-fA-F-]{36})/i);
      var sectionMatch = link.match(/[?&]section=([a-zA-Z0-9_-]+)/);
      var orderId = orderMatch ? orderMatch[1] : '';
      var conversationId = conversationMatch ? conversationMatch[1] : '';
      var selectedId = selectedMatch ? selectedMatch[1] : '';
      var linkSection = sectionMatch ? sectionMatch[1] : '';
      var fallback = {
        href: who === 'teacher' ? 'Tafseel-Teacher-Dashboard.dc.html'
          : who === 'quality' ? 'Tafseel-Quality-Dashboard.dc.html'
          : who === 'admin' ? 'Tafseel-Admin-Dashboard.dc.html'
          : 'Tafseel-Student-Dashboard.dc.html',
        section: 'overview',
        filter: '',
        orderId: '',
        focus: '',
        conversationId: '',
        selectedId: '',
        external: false
      };

      if (type === 'newmessage' || conversationId) {
        var messagesHref = (who === 'teacher'
          ? 'Tafseel-Teacher-Dashboard.dc.html?section=messages'
          : 'Tafseel-Student-Dashboard.dc.html?section=messages')
          + (conversationId ? ('&conversationId=' + encodeURIComponent(conversationId)) : '');
        return {
          href: messagesHref,
          section: 'messages',
          filter: '',
          orderId: '',
          focus: '',
          conversationId: conversationId,
          external: false
        };
      }

      if (sessionMatch || type.indexOf('session') === 0) {
        return {
          href: who === 'teacher'
            ? 'Tafseel-Teacher-Dashboard.dc.html?section=sessions'
            : 'Tafseel-Student-Dashboard.dc.html?section=sessions',
          section: 'sessions',
          filter: '',
          orderId: '',
          focus: '',
          conversationId: '',
          external: false
        };
      }

      if (!orderId && !type) return fallback;

      var knownStudent = {
        paymentrequired: 1,
        paymentconfirmed: 1,
        workstarted: 1,
        deliveryuploaded: 1,
        ordercompleted: 1,
        reviewsubmitted: 1,
        reviewmoderation: 1,
        refund: 1,
        dispute: 1,
        clarificationrequested: 1,
        requestdeclined: 1,
        newrequest: 1,
        clarificationreplied: 1,
        revisionrequested: 1,
        review: 1
      };

      if (who === 'quality') {
        var qualitySection = (type.indexOf('showcase') === 0 || linkSection === 'showcases' || linkSection === 'media')
          ? 'showcases'
          : (linkSection === 'additional' ? 'additional' : 'applications');
        var qualityHref = 'Tafseel-Quality-Dashboard.dc.html?section=' + qualitySection;
        if (selectedId) qualityHref += '&selectedId=' + encodeURIComponent(selectedId);
        return {
          href: qualityHref,
          section: qualitySection,
          filter: '',
          orderId: '',
          focus: '',
          conversationId: '',
          selectedId: selectedId,
          external: false
        };
      }

      if (who === 'admin') {
        var adminHref = 'Tafseel-Admin-Dashboard.dc.html?section=reviews';
        if (selectedId) adminHref += '&reviewId=' + encodeURIComponent(selectedId);
        if (type.indexOf('review') === 0 || linkSection === 'reviews') {
          return {
            href: adminHref,
            section: 'reviews',
            filter: '',
            orderId: '',
            focus: '',
            conversationId: '',
            selectedId: selectedId,
            external: false
          };
        }
        return fallback;
      }

      if (who === 'teacher') {
        if (type.indexOf('application') === 0 || type === 'qualificationrevoked') {
          return {
            href: 'Tafseel-Teacher-Apply.dc.html?view=status',
            section: 'status',
            filter: '',
            orderId: '',
            focus: '',
            conversationId: '',
            selectedId: '',
            external: false
          };
        }
        if (type.indexOf('showcase') === 0) {
          return {
            href: 'Tafseel-Teacher-Dashboard.dc.html?section=samples',
            section: 'samples',
            filter: '',
            orderId: '',
            focus: '',
            conversationId: '',
            selectedId: '',
            external: false
          };
        }
        if (!orderId && !knownStudent[type])
          return fallback;
        var teacherFocus = '';
        if (type === 'revisionrequested') teacherFocus = 'deliver';
        else if (type === 'paymentconfirmed' || type === 'paymentrequired') teacherFocus = '';
        else if (type === 'ordercompleted' || type === 'review') teacherFocus = '';
        return {
          href: 'Tafseel-Teacher-Dashboard.dc.html?section=requests'
            + (orderId ? ('&orderId=' + encodeURIComponent(orderId)) : '')
            + (teacherFocus ? ('&focus=' + teacherFocus) : ''),
          section: 'requests',
          filter: '',
          orderId: orderId,
          focus: teacherFocus,
          conversationId: '',
          selectedId: '',
          external: false
        };
      }

      // Student routes — unknown types without a persisted order target fail safe.
      if (!knownStudent[type] && !orderId) return fallback;

      if (type === 'paymentrequired') {
        return {
          href: orderId
            ? ('Tafseel-Payment.dc.html?orderId=' + encodeURIComponent(orderId))
            : 'Tafseel-Student-Dashboard.dc.html?section=requests&filter=action',
          section: 'requests',
          filter: 'action',
          orderId: orderId,
          focus: 'pay',
          conversationId: '',
          external: !!orderId
        };
      }

      var filter = 'orders';
      var focus = '';
      if (type === 'paymentconfirmed' || type === 'workstarted') {
        filter = 'orders';
        focus = '';
      } else if (type === 'deliveryuploaded') {
        filter = 'action';
        focus = 'delivery';
      } else if (type === 'ordercompleted' || type === 'reviewsubmitted' || type === 'reviewmoderation') {
        filter = 'done';
        focus = type === 'ordercompleted' ? 'rate' : 'review';
      } else if (type === 'refund' || type === 'dispute') {
        filter = 'done';
        focus = '';
      } else if (type === 'clarificationrequested' || type === 'requestdeclined') {
        filter = 'pending';
        focus = '';
      }

      var href = 'Tafseel-Student-Dashboard.dc.html?section=requests&filter=' + encodeURIComponent(filter);
      if (orderId) href += '&orderId=' + encodeURIComponent(orderId);
      if (focus) href += '&focus=' + encodeURIComponent(focus);
      return {
        href: href,
        section: 'requests',
        filter: filter,
        orderId: orderId,
        focus: focus,
        conversationId: '',
        external: false
      };
    },

    notificationTitle: function (notification) {
      if (!notification) return '';
      var key = 'notif_type_' + String(notification.type || '').toLowerCase();
      var localized = this.t(key);
      if (localized && localized.indexOf('⟦missing:') !== 0) return localized;
      return notification.title || '';
    },

    /**
     * Localize notification body by stable type at render time.
     * Stored body is treated as {detail} when the template includes it (user text,
     * titles, reasons). Fixed English bodies are replaced by locale templates.
     */
    notificationBody: function (notification) {
      if (!notification) return '';
      var detail = notification.body || '';
      var key = 'notif_body_' + String(notification.type || '').toLowerCase();
      var localized = this.t(key, { detail: detail });
      if (localized && localized.indexOf('⟦missing:') !== 0) return localized;
      return detail;
    },

    requestStatusLabel: function (status) {
      var keys = [
        'req_status_pending_review',
        'req_status_clarification',
        'req_status_accepted',
        'req_status_declined',
        'req_status_cancelled'
      ];
      return this.t(keys[status] || 'req_status_unknown');
    },

    /**
     * Deprecated: does not consider PaymentStatus, so an AwaitingPayment order
     * that is already Paid is mislabeled as still needing payment. Use
     * orderPresentation() for anything that renders a status chip or action.
     */
    orderStatusLabel: function (status) {
      var keys = [
        'order_status_payment_required',
        'order_status_in_progress',
        'order_status_delivered',
        'order_status_revision',
        'order_status_completed',
        'order_status_cancelled'
      ];
      return this.t(keys[status] || 'order_status_unknown');
    },

    /**
     * Canonical Order presentation projection. Single source of truth for both
     * dashboards — derives stage/label/action from Order.Status AND
     * Order.PaymentStatus together (never Status alone), per role.
     *
     * OrderStatus: 0 AwaitingPayment, 1 InProgress, 2 Delivered, 3 RevisionRequested,
     *              4 Completed, 5 Cancelled.
     * OrderPaymentStatus: 0 Pending, 1 Paid, 2 Failed, 3 Refunded.
     *
     * Returns { stage, labelKey, action, isTerminal } where action is one of
     * null | 'pay' | 'start' | 'deliver' | 'review' | 'rate' — the single primary
     * action available to the given role for this Order, or null when the row
     * should show a plain (non-clickable) status chip only.
     * Optional opts: { hasReview, reviewCanSubmit } — when provided, Completed
     * students only get 'rate' if reviewCanSubmit (or !hasReview).
     */
    orderPresentation: function (rawStatus, paymentStatus, role, opts) {
      var status = Number(rawStatus);
      var options = opts || {};
      if (status === 5) return { stage: 'cancelled', labelKey: 'order_status_cancelled', action: null, isTerminal: true };
      if (status === 4) {
        var canRate = role === 'student'
          && (options.reviewCanSubmit === true
            || (options.reviewCanSubmit !== false && !options.hasReview));
        return {
          stage: 'completed',
          labelKey: 'order_status_completed',
          action: canRate ? 'rate' : null,
          isTerminal: true
        };
      }
      if (status === 3)
        return {
          stage: 'revision',
          labelKey: 'order_status_revision',
          action: role === 'teacher' ? 'deliver' : null,
          isTerminal: false
        };
      if (status === 2)
        return {
          stage: 'delivered',
          labelKey: 'order_status_delivered',
          action: role === 'student' ? 'review' : null,
          isTerminal: false
        };
      if (status === 1)
        return {
          stage: 'in_progress',
          labelKey: 'order_status_in_progress',
          action: role === 'teacher' ? 'deliver' : null,
          isTerminal: false
        };
      // status === 0 (AwaitingPayment): the payment flag — not Status — decides what's next.
      if (Number(paymentStatus) === 1)
        return {
          stage: 'payment_confirmed',
          labelKey: 'order_status_payment_confirmed',
          action: role === 'teacher' ? 'start' : null,
          isTerminal: false
        };
      return {
        stage: 'awaiting_payment',
        labelKey: 'order_status_payment_required',
        action: role === 'student' ? 'pay' : null,
        isTerminal: false
      };
    },

    /**
     * Status chip colors keyed by kind + numeric status — never by localized label.
     * Optional paymentStatus: paid-but-unstarted AwaitingPayment must not use error red.
     */
    statusToneStyle: function (kind, rawStatus, paymentStatus) {
      var tones = {
        request: {
          0: ['var(--warning-soft)', 'var(--warning)'],
          1: ['var(--info-soft)', 'var(--info)'],
          2: ['var(--info-soft)', 'var(--info)'],
          3: ['var(--surface-2)', 'var(--muted)'],
          4: ['var(--surface-2)', 'var(--muted)']
        },
        order: {
          0: ['var(--error-soft)', 'var(--error)'],
          1: ['var(--primary-soft)', 'var(--primary)'],
          2: ['var(--accent-soft)', 'var(--accent)'],
          3: ['var(--warning-soft)', 'var(--warning)'],
          4: ['var(--success-soft)', 'var(--success)'],
          5: ['var(--surface-2)', 'var(--muted)']
        }
      };
      var pair = (tones[kind] || {})[rawStatus] || ['var(--surface-2)', 'var(--muted)'];
      if (kind === 'order' && Number(rawStatus) === 0 && Number(paymentStatus) === 1)
        pair = ['var(--info-soft)', 'var(--info)'];
      return 'display:inline-flex;align-items:center;height:24px;padding-inline:9px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap;background:'
        + pair[0] + ';color:' + pair[1];
    },

    /**
     * Student-facing lifecycle steps for an order stage. Labels only — no percentages,
     * bars, or invented ETAs. States: done | current | upcoming | muted.
     */
    orderProgressSteps: function (stage) {
      var steps = [
        { key: 'payment', labelKey: 'order_step_payment' },
        { key: 'work', labelKey: 'order_step_work' },
        { key: 'delivery', labelKey: 'order_step_delivery' },
        { key: 'review', labelKey: 'order_step_review' },
        { key: 'done', labelKey: 'order_step_done' }
      ];
      var current = {
        awaiting_payment: 0,
        payment_confirmed: 1,
        in_progress: 1,
        delivered: 3,
        revision: 2,
        completed: 4,
        cancelled: -1
      }[String(stage || '')];
      if (current == null) current = -1;
      var self = this;
      return steps.map(function (step, index) {
        var state = 'muted';
        if (current >= 0) {
          if (index < current) state = 'done';
          else if (index === current) state = 'current';
          else state = 'upcoming';
        }
        return {
          key: step.key,
          n: String(index + 1),
          label: self.t(step.labelKey),
          state: state,
          current: state === 'current' ? 'step' : false
        };
      });
    },

    money: function (value, currency) {
      var amount = Number(value);
      if (!Number.isFinite(amount)) return this.t('td_unavailable');
      var code = String(currency || 'SAR').trim() || 'SAR';
      try {
        return this.number(amount, { style: 'currency', currency: code, currencyDisplay: 'symbol' });
      } catch (_) {
        return code + ' ' + this.number(amount);
      }
    },

    dashboardHrefForSession: function (session) {
      var roles = (session && session.roles) || [];
      if (roles.indexOf('Admin') >= 0) return 'Tafseel-Admin-Dashboard.dc.html';
      if (roles.indexOf('QualityReviewer') >= 0) return 'Tafseel-Quality-Dashboard.dc.html';
      if (roles.indexOf('Teacher') >= 0) return 'Tafseel-Teacher-Dashboard.dc.html';
      if (roles.indexOf('Student') >= 0) return 'Tafseel-Student-Dashboard.dc.html';
      return 'Tafseel-Landing.dc.html';
    },

    // Same-origin application return only. Rejects open redirects and non-app targets.
    safeAppReturnHref: function (raw) {
      if (raw == null) return '';
      var value = String(raw).trim();
      if (!value) return '';
      try { value = decodeURIComponent(value); } catch (_) { return ''; }
      value = value.trim();
      if (!value) return '';
      if (/^https?:/i.test(value) || /^\/\//.test(value) || /^\\/.test(value) || /^javascript:/i.test(value)
          || /^data:/i.test(value) || /^vbscript:/i.test(value) || /[\u0000-\u001F\u007F]/.test(value))
        return '';
      var path = value.split('#')[0];
      if (path.charAt(0) === '/') {
        if (path.indexOf('/app/') !== 0) return '';
        path = path.slice('/app/'.length);
      }
      if (path.charAt(0) === '.' || path.indexOf('..') >= 0 || path.indexOf(':') >= 0 || path.indexOf('//') >= 0)
        return '';
      var file = path.split('?')[0];
      if (!/^Tafseel-[A-Za-z0-9-]+\.dc\.html$/.test(file)) return '';
      if (/^Tafseel-Auth\.dc\.html$/i.test(file)) return '';
      return path;
    },

    authHref: function (intended) {
      var safe = this.safeAppReturnHref(intended || '');
      if (!safe) return 'Tafseel-Auth.dc.html';
      return 'Tafseel-Auth.dc.html?return=' + encodeURIComponent(safe);
    },

    viewerTimeZone: function () {
      try {
        var id = Intl.DateTimeFormat().resolvedOptions().timeZone;
        return id ? { id: id, fallback: false } : { id: 'UTC', fallback: true };
      } catch (_) {
        return { id: 'UTC', fallback: true };
      }
    },

    availabilityPath: function (teacherIds, teacherServiceId) {
      var timezone = this.viewerTimeZone();
      var query = new URLSearchParams();
      Array.from(new Set(teacherIds || [])).slice(0, 12).forEach(function (id) {
        query.append('teacherIds', id);
      });
      if (teacherServiceId) query.set('teacherServiceId', teacherServiceId);
      query.set('viewerTimeZoneId', timezone.id);
      return '/live-sessions/availability-summaries?' + query.toString();
    },

    availabilityText: function (summary) {
      if (!summary || !summary.state) return this.t('availability_error');
      var zone = summary.viewerTimeZoneId || 'UTC';
      var startsAt = summary.nextSlotStartUtc ? new Date(summary.nextSlotStartUtc) : null;
      var locale = this.lang === 'ar' ? 'ar-SA' : 'en-US';
      var time = startsAt ? new Intl.DateTimeFormat(locale, {
        hour: 'numeric', minute: '2-digit', timeZone: zone
      }).format(startsAt) : '';
      var date = startsAt ? new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium', timeStyle: 'short', timeZone: zone
      }).format(startsAt) : '';
      var key = {
        available_today: 'availability_available_today',
        next_available: 'availability_next_available',
        no_upcoming_availability: 'availability_no_upcoming',
        no_schedule_configured: 'availability_no_schedule',
        temporarily_unavailable: 'availability_temporarily_unavailable',
        fully_booked: 'availability_fully_booked',
        not_applicable: 'availability_not_applicable'
      }[summary.state];
      if (!key) return this.t('availability_error');
      var text = this.t(key, {
        time: time,
        date: date,
        duration: this.number(summary.durationMinutes || 0)
      });
      return summary.timeZoneFallbackUsed
        ? text + ' - ' + this.t('availability_utc_fallback')
        : text;
    },

    discovery: {
      INTENT_KEY: 'tafseel.discovery.intent.v1',
      INTENT_TTL_MS: 15 * 60 * 1000,
      MATH_ALIASES: ['mathematics', 'math', 'maths', 'calculus', 'integrals', 'integral', 'integration',
        'رياضيات', 'الرياضيات', 'تكامل', 'التكامل', 'تفاضل', 'التفاضل', 'حساب'],
      LIVE_ALIASES: ['live', 'live session', 'online session', 'جلسة مباشرة', 'جلسه مباشره',
        'جلسة اونلاين', 'جلسه اونلاين', 'اونلاين'],
      DAY_ALIASES: {
        sunday: 0, sun: 0, الاحد: 0, الأحد: 0,
        monday: 1, mon: 1, الاثنين: 1,
        tuesday: 2, tue: 2, الثلاثاء: 2,
        wednesday: 3, wed: 3, الاربعاء: 3, الأربعاء: 3,
        thursday: 4, thu: 4, thurs: 4, الخميس: 4, خميس: 4,
        friday: 5, fri: 5, الجمعة: 5, جمعه: 5,
        saturday: 6, sat: 6, السبت: 6
      },
      key: function (value) {
        return String(value || '').normalize('NFD').replace(/\p{M}/gu, '')
          .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
      },
      storeIntent: function (text) {
        var value = String(text || '').trim();
        if (!value || value.length < 3) return;
        try {
          sessionStorage.setItem(this.INTENT_KEY, JSON.stringify({
            text: value.slice(0, 2000), createdAt: Date.now()
          }));
        } catch (_) {}
      },
      consumeIntent: function () {
        try {
          var raw = sessionStorage.getItem(this.INTENT_KEY);
          sessionStorage.removeItem(this.INTENT_KEY);
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed.text !== 'string') return null;
          if (typeof parsed.createdAt !== 'number' || Date.now() - parsed.createdAt > this.INTENT_TTL_MS)
            return null;
          var text = parsed.text.trim();
          return text.length >= 3 ? { text: text } : null;
        } catch (_) {
          try { sessionStorage.removeItem(this.INTENT_KEY); } catch (__) {}
          return null;
        }
      },
      handoffToBrowse: function (text) {
        this.storeIntent(text);
        location.href = 'Tafseel-Browse-Teachers.dc.html';
      },
      looksLikeIntent: function (text) {
        var value = String(text || '').trim();
        if (!value) return false;
        if (this.isProbablyTeacherName(value)) return false;
        if (value.length >= 40) return true;
        if (value.split(/\s+/).length < 2) return false;
        return /\b(?:need|help|exam|looking\s+for|before|urgent)\b|محتاج|محتاجة|احتاج|أحتاج|امتحان|اختبار|ساعدني|عايز|عاوز/i.test(value);
      },
      isProbablyTeacherName: function (text) {
        var value = String(text || '').trim();
        if (!value || /\s/.test(value) || value.length > 40) return false;
        var key = this.key(value);
        if (this.MATH_ALIASES.some(function (alias) { return this.key(alias) === key; }, this)) return false;
        if (this.LIVE_ALIASES.some(function (alias) { return this.key(alias) === key; }, this)) return false;
        if (this.DAY_ALIASES[key] != null) return false;
        return /^[\p{L}.'’-]+$/u.test(value);
      },
      nextWeekdayIso: function (dayIndex, timeZoneId) {
        var nowParts = new Intl.DateTimeFormat('en-US', {
          timeZone: timeZoneId || 'UTC', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit'
        }).formatToParts(new Date());
        var map = {};
        nowParts.forEach(function (part) { map[part.type] = part.value; });
        var weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
        var todayIndex = weekdayMap[map.weekday];
        var delta = ((dayIndex - todayIndex) + 7) % 7;
        var local = new Date(Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day) + delta));
        return local.toISOString().slice(0, 10);
      },
      weekdayLabel: function (iso, arabic) {
        if (!iso) return '';
        var date = new Date(iso + 'T12:00:00Z');
        return new Intl.DateTimeFormat(arabic ? 'ar-SA' : 'en-US', {
          weekday: 'long', timeZone: 'UTC'
        }).format(date);
      },
      matchCatalog: function (text, items, extraAliases) {
        var key = this.key(text);
        if (!key || !items || !items.length) return null;
        var aliases = (extraAliases || []).map(this.key, this);
        var wanted = aliases.indexOf(key) >= 0 ? aliases.concat([key]) : [key];
        var exact = items.filter(function (item) {
          return [item.name, item.nameEn, item.nameAr, item.code].some(function (name) {
            return name && wanted.indexOf(this.key(name)) >= 0;
          }, this);
        }, this);
        if (exact.length === 1) return exact[0];
        if (exact.length > 1) {
          var coded = exact.filter(function (item) { return item.code === 'live_session'; });
          return coded.length === 1 ? coded[0] : null;
        }
        return null;
      },
      interpretLocal: function (text, catalogs, timeZoneId) {
        var value = String(text || '').trim();
        var result = { subjectId: '', serviceId: '', availableOn: '', hasAny: false, hasStrong: false };
        if (!value) return result;
        var subjects = (catalogs && catalogs.subjects) || [];
        var services = (catalogs && catalogs.services) || [];
        var tokens = value.split(/[\s,،]+/).filter(Boolean);
        var subject = this.matchCatalog(value, subjects, this.MATH_ALIASES);
        if (!subject) {
          tokens.forEach(function (token) {
            if (!subject) subject = this.matchCatalog(token, subjects, this.MATH_ALIASES);
          }, this);
        }
        var liveHit = this.LIVE_ALIASES.some(function (alias) {
          return this.key(value).indexOf(this.key(alias)) >= 0;
        }, this);
        var service = liveHit
          ? (services.filter(function (item) { return item.code === 'live_session'; })[0]
            || services.filter(function (item) { return item.orderType === 'live_session'; })[0]
            || null)
          : this.matchCatalog(value, services, this.LIVE_ALIASES);
        var dayIndex = null;
        var dayKey = this.key(value);
        Object.keys(this.DAY_ALIASES).forEach(function (alias) {
          if (dayKey.indexOf(this.key(alias)) >= 0) dayIndex = this.DAY_ALIASES[alias];
        }, this);
        if (subject) result.subjectId = subject.id;
        if (service) result.serviceId = service.id;
        if (dayIndex != null) result.availableOn = this.nextWeekdayIso(dayIndex, timeZoneId);
        result.hasAny = !!(result.subjectId || result.serviceId || result.availableOn);
        result.hasStrong = !!(result.subjectId && result.serviceId)
          || !!(result.subjectId && result.availableOn)
          || !!(result.serviceId && result.availableOn);
        return result;
      }
    },

    orderTimelineEvent: function (event) {
      var metadata = event && event.metadata || {};
      var details = [];
      if (metadata.revisionSequence != null)
        details.push(this.t('order_timeline_revision_sequence', {
          n: this.number(metadata.revisionSequence)
        }));
      if (metadata.originalName)
        details.push(this.t('order_timeline_delivery_file', { name: metadata.originalName }));
      return {
        id: event.id,
        title: this.t('order_timeline_event_' + event.eventType),
        actor: this.t('order_timeline_actor_' + event.actorRole),
        occurredAt: this.date(event.occurredAt),
        details: details.join(' · ')
      };
    },

    modalKeyDown: function (event, close) {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab') return;
      var controls = Array.from(event.currentTarget.querySelectorAll(
        'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
      )).filter(function (control) { return control.offsetParent !== null; });
      if (!controls.length) return;
      var first = controls[0];
      var last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },

    number: function (value, options) {
      return new Intl.NumberFormat(this.lang === 'ar' ? 'ar-SA' : 'en-US', options).format(value);
    },
    date: function (value, options) {
      return new Intl.DateTimeFormat(this.lang === 'ar' ? 'ar-SA' : 'en-US', options || {
        dateStyle: 'medium',
        timeStyle: 'short'
      }).format(new Date(value));
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
