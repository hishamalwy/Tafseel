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

    init: function () {
      try {
        this.theme = localStorage.getItem(LS_THEME) || 'light';
        this.lang = localStorage.getItem(LS_LANG) || 'en';
      } catch (_) {}
      if (!['light', 'dark'].includes(this.theme)) this.theme = 'light';
      if (!['en', 'ar'].includes(this.lang)) this.lang = 'en';
      this.apply(false);
      this.observe();
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
      this._subs.slice().forEach(function (subscriber) { subscriber(); });
      document.dispatchEvent(new CustomEvent('tafseel:change', {
        detail: { theme: this.theme, lang: this.lang }
      }));
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
      document.querySelectorAll('[data-tafseel-language]').forEach(function (button) {
        button.textContent = self.t('language_target');
        button.setAttribute('aria-label', self.localizeText('Switch language'));
      });
      document.querySelectorAll('[data-tafseel-theme]').forEach(function (button) {
        button.textContent = self.localizeText('Theme');
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
