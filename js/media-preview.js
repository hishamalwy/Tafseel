(function () {
  if (!window.Tafseel || window.Tafseel.mediaPreview) return;

  var attached = new WeakSet();
  var fallbackText = {
    media_video_label: ['Teaching video', 'فيديو تعليمي'],
    media_play_video: ['Play video', 'تشغيل الفيديو'],
    media_loading: ['Loading video…', 'جارٍ تحميل الفيديو…'],
    media_playback_error: ['This video could not be played.', 'تعذّر تشغيل هذا الفيديو.'],
    media_unsupported: ['This video format is not supported by this browser.', 'صيغة الفيديو غير مدعومة في هذا المتصفح.'],
    media_download_video: ['Download video', 'تنزيل الفيديو']
  };
  var text = function (key, fallback) {
    var language = document.documentElement.lang || 'en';
    var catalog = window.TafseelLocales && window.TafseelLocales[language];
    if (catalog && catalog[key]) return catalog[key];
    try {
      var value = window.Tafseel.t(key);
      if (value && value.indexOf('⟦missing:') !== 0) return value;
    } catch (_) {}
    var values = fallbackText[key];
    return values ? values[language === 'ar' ? 1 : 0] : fallback;
  };
  var localize = function (element, key, fallback) {
    element.setAttribute('data-i18n', key);
    element.textContent = text(key, fallback);
    try { window.Tafseel.translate(element.parentElement || element); } catch (_) {}
  };
  var refreshLabels = function (video) {
    var refs = video._mediaPreviewRefs;
    if (!refs) return;
    localize(refs.message, 'media_loading', 'Loading video…');
    localize(refs.download, 'media_download_video', 'Download video');
    refs.play.setAttribute('aria-label', text('media_play_video', 'Play video'));
  };

  function sync(root) {
      (root || document).querySelectorAll('video[data-media-preview]').forEach(function (video) {
        var source = video.getAttribute('src') || '';
        if (attached.has(video)) {
          if (video.dataset.mediaBoundSrc !== source) {
            video.dataset.mediaBoundSrc = source;
            video.pause();
            video.dataset.mediaState = 'loading';
            video.load();
          }
          refreshLabels(video);
          return;
        }
        attached.add(video);
        video.dataset.mediaBoundSrc = source;
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', video.getAttribute('aria-label') || text('media_video_label', 'Teaching video'));
      video.dataset.mediaState = 'loading';

      var frame = video.parentElement;
      if (!frame || !frame.classList.contains('tf-media-frame')) {
        var host = frame;
        frame = document.createElement('div');
        frame.className = 'tf-media-frame';
        host.insertBefore(frame, video);
        frame.appendChild(video);
      }
      var play = frame && frame.querySelector('[data-media-play]');
      var downloadAllowed = video.dataset.downloadAllowed !== 'false';
      if (!play) {
        play = document.createElement('button');
        play.type = 'button';
        play.className = 'tf-media-play';
        play.setAttribute('data-media-play', '');
        play.appendChild(document.createTextNode('▶'));
        frame.insertBefore(play, video);
      }
      if (play) {
        play.setAttribute('aria-label', text('media_play_video', 'Play video'));
        try { window.Tafseel.translate(play.parentElement || play); } catch (_) {}
        play.removeAttribute('aria-hidden');
        play.addEventListener('click', function () {
          if (video.ended) video.currentTime = 0;
          if (video.paused) video.play().catch(function () { setState('error'); });
          else video.pause();
        });
      }

      var status = document.createElement('div');
      status.className = 'tf-media-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      video.parentNode.insertBefore(status, video);
      var message = document.createElement('span');
      status.appendChild(message);
      localize(message, 'media_loading', 'Loading video…');
      var download = document.createElement('a');
      download.className = 'tf-media-download';
      localize(download, 'media_download_video', 'Download video');
      download.setAttribute('download', 'video.mp4');
      download.setAttribute('target', '_blank');
      download.setAttribute('rel', 'noopener');
      status.appendChild(download);
      video._mediaPreviewRefs = { message: message, download: download, play: play };

      function setState(state) {
        video.dataset.mediaState = state;
        if (play) play.hidden = state === 'playing' || state === 'error' || state === 'unsupported';
        if (state === 'loading') {
          status.hidden = false;
          localize(message, 'media_loading', 'Loading video…');
          download.hidden = true;
          video.hidden = false;
        } else if (state === 'error' || state === 'unsupported') {
          status.hidden = false;
          localize(message, state === 'unsupported' ? 'media_unsupported' : 'media_playback_error', 'This video could not be played.');
          download.href = video.currentSrc || video.src || '#';
          download.hidden = !downloadAllowed || download.href === '#';
          video.hidden = true;
        } else {
          status.hidden = true;
          download.hidden = true;
          video.hidden = false;
        }
      }

      video.addEventListener('loadstart', function () { setState('loading'); });
      video.addEventListener('loadedmetadata', function () { setState('ready'); });
      video.addEventListener('canplay', function () { setState('ready'); });
      video.addEventListener('playing', function () { setState('playing'); });
      video.addEventListener('pause', function () { if (!video.ended) setState('paused'); });
      video.addEventListener('ended', function () { setState('paused'); });
      video.addEventListener('error', function () { setState(video.error && video.error.code === 4 ? 'unsupported' : 'error'); });
      video.addEventListener('stalled', function () { setState('loading'); });
      setState(video.readyState >= 1 ? 'ready' : 'loading');
    });
  }

  window.Tafseel.mediaPreview = { sync: sync };
})();
