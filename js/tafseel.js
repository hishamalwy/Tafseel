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
        var needsMarks = false;
        var needsControls = false;
        changes.forEach(function (change) {
          if (change.type === 'characterData') self.translate(change.target);
          change.addedNodes.forEach(function (node) { self.translate(node); });
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
        attributeFilter: ['src']
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

    defaultAvatar: 'assets/brand/default-avatar.svg',

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
        var group = status === 4 ? 'done'
          : (status === 0 || status === 2 || status === 3 ? 'action' : 'active');
        return {
          id: x.id,
          learningRequestId: x.learningRequestId,
          title: self.orderTitle(x),
          service: self.t('dash_service_personalized'),
          teacher: self.partyName(x, 'teacher'),
          status: self.orderStatusLabel(x.status),
          deadline: self.date(x.agreedDeliveryAt, { dateStyle: 'medium' }),
          amount: self.money(x.studentTotal, x.currency || 'SAR'),
          group: group,
          kind: 'order',
          rawStatus: status,
          paymentStatus: x.paymentStatus,
          version: x.version,
          studentTotal: Number(x.studentTotal) || 0,
          currency: x.currency || 'SAR'
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
          return list.filter(function (r) { return r.kind === 'order' && r.group === 'done'; });
        case 'all':
        default:
          return list.filter(function (r) {
            return r.kind === 'request' || (r.kind === 'order' && r.group !== 'done');
          });
      }
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

    /** Status chip colors keyed by kind + numeric status — never by localized label. */
    statusToneStyle: function (kind, rawStatus) {
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
      return 'display:inline-flex;align-items:center;height:24px;padding-inline:9px;border-radius:6px;font-size:12px;font-weight:700;white-space:nowrap;background:'
        + pair[0] + ';color:' + pair[1];
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
