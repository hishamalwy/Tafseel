(function () {
  'use strict';

  var form = document.getElementById('application-form');
  var demoForm = document.getElementById('demo-form');
  var subject = document.getElementById('subject');
  var topic = document.getElementById('topic');
  var languageBox = document.getElementById('teaching-languages');
  var status = document.getElementById('apply-status');
  var saveBtn = document.getElementById('save-application');
  var uploadBtn = document.getElementById('upload-demo');
  var submitBtn = document.getElementById('submit-application');
  var current = null;
  var subjects = [];
  var topics = [];
  var languages = [];
  var busy = false;

  function t(key, values) {
    try { return Tafseel.t(key, values); } catch (_) { return key; }
  }

  function message(text, kind) {
    status.textContent = text;
    status.dataset.kind = kind || '';
  }

  function setBusy(next) {
    busy = !!next;
    [saveBtn, uploadBtn, submitBtn].forEach(function (btn) {
      if (btn) btn.disabled = busy;
    });
  }

  function statusName(value) {
    return [
      t('apply_status_draft'),
      t('apply_status_submitted'),
      t('apply_status_under_review'),
      t('apply_status_changes'),
      t('apply_status_approved'),
      t('apply_status_rejected'),
      t('apply_status_withdrawn')
    ][value] || t('apply_status_unknown');
  }

  function escape(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function selectedLanguageIds() {
    return Array.from(languageBox.querySelectorAll('input:checked')).map(function (input) {
      return input.value;
    });
  }

  function renderLanguages(selected) {
    var chosen = new Set(selected || selectedLanguageIds());
    languageBox.innerHTML = languages.map(function (language) {
      var id = 'teaching-language-' + escape(language.id);
      var label = Tafseel.languageLabel(language);
      return '<label for="' + id + '" style="min-height:40px;padding:8px 12px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text-2)">' +
        '<input id="' + id + '" type="checkbox" value="' + escape(language.id) + '"' +
        (chosen.has(language.id) ? ' checked' : '') + '><span data-i18n-skip>' + escape(label) + '</span></label>';
    }).join('');
  }

  function renderAssignment() {
    var item = topics.find(function (x) { return x.id === topic.value; });
    var card = document.getElementById('assignment-details');
    if (!item) {
      card.hidden = true;
      return;
    }
    var ar = document.documentElement.lang === 'ar';
    var title = ar && item.titleAr ? item.titleAr : item.name;
    var instructions = ar && item.instructionsAr ? item.instructionsAr : item.detail;
    var resources = (item.resources || []).map(function (r) {
      var name = ar && r.displayNameAr ? r.displayNameAr : r.displayName;
      var label = r.isFile ? t('apply_open_pdf') + ': ' + name : name;
      return r.url ? '<li><a href="' + escape(r.url) + '" target="_blank" rel="noopener">' + escape(label) + '</a></li>'
        : '<li>' + escape(name) + '</li>';
    }).join('');
    card.innerHTML = '<h2>' + escape(title) + '</h2><p>' + escape(instructions || '') + '</p>' +
      '<div class="tf-assignment-meta"><span>Minimum ' + escape(item.minVideoSeconds || 30) + 's</span>' +
      '<span>Expected ' + escape(item.expectedVideoSeconds || item.maxVideoSeconds || 180) + 's</span>' +
      '<span>Maximum ' + escape(item.maxVideoSeconds || 180) + 's</span></div>' +
      (resources ? '<h3>' + escape(t('apply_assignment_resources')) + '</h3><ul>' + resources + '</ul>' : '');
    card.hidden = false;
    var duration = document.getElementById('duration');
    duration.min = item.minVideoSeconds || 30;
    duration.max = item.maxVideoSeconds || 600;
    duration.value = item.expectedVideoSeconds || item.maxVideoSeconds || 180;
  }

  async function loadTopics() {
    if (!subject.value) {
      topic.innerHTML = '';
      return;
    }
    topics = await Tafseel.api.get('/topics?qualificationOnly=true&subjectId=' + encodeURIComponent(subject.value));
    topic.innerHTML = topics.map(function (x) {
      return '<option value="' + escape(x.id) + '">' + escape(x.name) + '</option>';
    }).join('');
    renderAssignment();
  }

  async function loadApplications() {
    var items = await Tafseel.api.get('/teacher-applications/mine');
    current = items.find(function (x) { return x.status === 0 || x.status === 3; }) || items[0] || null;
    var list = document.getElementById('applications');
    list.innerHTML = items.length
      ? items.map(function (x) {
          return '<button type="button" data-id="' + escape(x.id) + '"><strong>' + escape(statusName(x.status)) +
            '</strong><br><span>' + escape(x.subjectName || '') + ' · ' + escape(x.assignmentTitle || '') + '</span>' +
            (x.publicFeedback ? '<br><span class="tf-muted">' + escape(x.publicFeedback) + '</span>' : '') + '</button>';
        }).join('')
      : '<p class="tf-muted">' + escape(t('apply_none')) + '</p>';
    list.querySelectorAll('[data-id]').forEach(function (button) {
      button.addEventListener('click', async function () {
        current = items.find(function (x) { return x.id === button.dataset.id; });
        if (!current) return;
        subject.value = current.subjectId;
        await loadTopics();
        topic.value = current.qualificationTopicId;
        renderAssignment();
        document.getElementById('city').value = current.city || '';
        document.getElementById('years').value = String(current.experienceYears || 0);
        document.getElementById('degree').value = current.degree || '';
        demoForm.hidden = ![0, 3].includes(current.status);
        message(current.publicFeedback || statusName(current.status), current.status === 3 ? 'warning' : '');
      });
    });
    demoForm.hidden = !current || ![0, 3].includes(current.status);
    document.getElementById('step-details').dataset.active = String(!current);
    document.getElementById('step-demo').dataset.active = String(!!current && [0, 3].includes(current.status));
    document.getElementById('step-review').dataset.active = String(!!current && ![0, 3].includes(current.status));
  }

  subject.addEventListener('change', function () {
    loadTopics().catch(function (e) { message(Tafseel.api.errorMessage(e), 'error'); });
  });
  topic.addEventListener('change', renderAssignment);
  document.getElementById('demo').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var video = document.createElement('video');
    var url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = function () {
      document.getElementById('duration').value = String(Math.max(1, Math.round(video.duration)));
      URL.revokeObjectURL(url);
    };
    video.onerror = function () { URL.revokeObjectURL(url); };
    video.src = url;
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    var years = Number(document.getElementById('years').value);
    var languageIds = selectedLanguageIds();
    if (!languageIds.length) {
      message(t('apply_language_required'), 'error');
      return;
    }
    if (!Number.isFinite(years) || years < 0 || years > 80) {
      message(Tafseel.api.errorMessage({ message: t('apply_years') }), 'error');
      return;
    }
    var input = {
      subjectId: subject.value,
      qualificationTopicId: topic.value,
      city: document.getElementById('city').value.trim(),
      experienceYears: years,
      degree: document.getElementById('degree').value.trim()
    };
    setBusy(true);
    try {
      if (current && [0, 3].includes(current.status))
        await Tafseel.api.put('/teacher-applications/' + current.id, input, { 'If-Match': current.version });
      else
        current = await Tafseel.api.post('/teacher-applications', input);
      await Tafseel.api.put('/teachers/me/languages', { ids: languageIds });
      await loadApplications();
      message(t('apply_saved'), 'success');
    } catch (error) {
      message(Tafseel.api.errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  });

  demoForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!current || busy) return;
    var file = document.getElementById('demo').files[0];
    var duration = Number(document.getElementById('duration').value);
    if (!file) {
      message(t('apply_demo_file'), 'error');
      return;
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 600) {
      message(t('apply_duration'), 'error');
      return;
    }
    var data = new FormData();
    data.append('file', file);
    data.append('durationSeconds', String(duration));
    setBusy(true);
    try {
      await Tafseel.api.upload('/teacher-applications/' + current.id + '/demo', data, { 'If-Match': current.version });
      await loadApplications();
      message(t('apply_demo_uploaded'), 'success');
    } catch (error) {
      message(Tafseel.api.errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  });

  submitBtn.addEventListener('click', async function () {
    if (!current || busy) return;
    setBusy(true);
    try {
      await Tafseel.api.post('/teacher-applications/' + current.id + '/submit', null, { 'If-Match': current.version });
      await loadApplications();
      message(t('apply_submitted'), 'success');
    } catch (error) {
      message(Tafseel.api.errorMessage(error), 'error');
    } finally {
      setBusy(false);
    }
  });

  document.addEventListener('tafseel:change', function () {
    renderLanguages();
    loadApplications().catch(function () {});
  });

  (async function () {
    var session = await Tafseel.api.ready();
    if (!session) return location.replace('Tafseel-Auth.dc.html');
    if (!(session.roles || []).includes('Teacher')) {
      message(t('apply_teacher_required'), 'error');
      return;
    }
    try {
      var loaded = await Promise.all([
        Tafseel.api.get('/subjects'),
        Tafseel.api.get('/languages'),
        Tafseel.api.get('/teachers/me')
      ]);
      subjects = loaded[0];
      languages = loaded[1];
      renderLanguages((loaded[2].languages || []).map(function (language) { return language.id; }));
      subject.innerHTML = subjects.map(function (x) {
        return '<option value="' + escape(x.id) + '">' + escape(x.name) + '</option>';
      }).join('');
      await loadTopics();
      await loadApplications();
      var lifecycle = await Tafseel.api.get('/teachers/onboarding-status');
      var lifecycleEl = document.getElementById('lifecycle-status');
      lifecycleEl.textContent = lifecycle.nextAction || '';
      lifecycleEl.hidden = !lifecycle.nextAction;
    } catch (error) {
      message(Tafseel.api.errorMessage(error), 'error');
    }
  })();
})();
