/* Early theme/lang boot — load before css/tafseel.css to avoid FOUC. */
(function () {
  try {
    var theme = localStorage.getItem('tafseel-theme');
    if (theme === 'dark' || theme === 'light') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    var lang = localStorage.getItem('tafseel-lang');
    if (lang === 'ar') {
      document.documentElement.lang = 'ar';
      document.documentElement.dir = 'rtl';
    } else if (lang === 'en') {
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
    }
  } catch (_) {}
})();
