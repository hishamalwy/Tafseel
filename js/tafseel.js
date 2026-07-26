/* ============================================================
   Tafseel — shared frontend runtime (vanilla JS, no framework)
   Owns: theme persistence, language direction, i18n swapping.
   Pages register their own dictionaries with Tafseel.addDict().
   Replaceable with a real i18n/API layer later.
   ============================================================ */
(function () {
  /* Helmet scripts can re-execute on remount; never rebuild a live singleton. */
  if (window.Tafseel && window.Tafseel.__ready) return;

  var LS_THEME = 'tafseel-theme';
  var LS_LANG = 'tafseel-lang';

  var NAV_AR = {
    nav_browse: 'تصفح المعلمين',
    nav_subjects: 'المواد',
    nav_how: 'كيف يعمل',
    nav_teach: 'انضم كمعلم',
    nav_about: 'من نحن',
    nav_login: 'تسجيل الدخول',
    nav_start: 'ابدأ الآن'
  };

  var Tafseel = {
    dict: Object.assign({}, NAV_AR),
    theme: 'light',
    lang: 'en',
    _subs: [],

    /* Read persisted preferences and apply them to <html>. */
    init: function () {
      try {
        this.theme = localStorage.getItem(LS_THEME) || 'light';
        this.lang = localStorage.getItem(LS_LANG) || 'en';
      } catch (e) {}
      this.apply(false);
      return this;
    },

    apply: function (persist) {
      var r = document.documentElement;
      r.setAttribute('data-theme', this.theme);
      r.setAttribute('dir', this.lang === 'ar' ? 'rtl' : 'ltr');
      r.setAttribute('lang', this.lang);
      if (persist !== false) {
        try {
          localStorage.setItem(LS_THEME, this.theme);
          localStorage.setItem(LS_LANG, this.lang);
        } catch (e) {}
      }
      this.translate();
      this._subs.forEach(function (fn) { fn(); });
      document.dispatchEvent(new CustomEvent('tafseel:change', { detail: { theme: this.theme, lang: this.lang } }));
    },

    setTheme: function (t) { this.theme = t; this.apply(); },
    toggleTheme: function () { this.setTheme(this.theme === 'dark' ? 'light' : 'dark'); },
    setLang: function (l) { this.lang = l; this.apply(); },
    toggleLang: function () { this.setLang(this.lang === 'ar' ? 'en' : 'ar'); },

    /* Pages call this with their own {key: arabicString} map. */
    addDict: function (d) { Object.assign(this.dict, d); this.translate(); return this; },

    /* Swap the text of every [data-i18n] node. English source text is
       cached on first pass so switching back needs no dictionary. */
    translate: function () {
      var ar = this.lang === 'ar';
      var dict = this.dict;
      document.querySelectorAll('[data-i18n]').forEach(function (el) {
        var key = el.getAttribute('data-i18n');
        if (el.dataset.en === undefined) el.dataset.en = el.textContent;
        var next = ar ? (dict[key] !== undefined ? dict[key] : el.dataset.en) : el.dataset.en;
        if (el.textContent !== next) el.textContent = next;
      });
      document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
        var key = el.getAttribute('data-i18n-ph');
        if (el.dataset.enPh === undefined) el.dataset.enPh = el.placeholder || '';
        el.placeholder = ar ? (dict[key] || el.dataset.enPh) : el.dataset.enPh;
      });
    },

    onChange: function (fn) { this._subs.push(fn); return fn; },
    offChange: function (fn) { this._subs = this._subs.filter(function (f) { return f !== fn; }); },

    t: function (en, ar) { return this.lang === 'ar' ? ar : en; },

    /* Currency helper — Saudi Riyal, swap here for other markets. */
    money: function (n) {
      return this.lang === 'ar' ? n.toLocaleString('ar-EG') + ' ر.س' : 'SAR ' + n.toLocaleString('en-US');
    }
  };

  window.Tafseel = Tafseel.init();
  window.Tafseel.__ready = true;
})();
