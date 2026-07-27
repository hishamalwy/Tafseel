(function () {
  'use strict';

  var form = document.getElementById('application-form');
  var demoForm = document.getElementById('demo-form');
  var subject = document.getElementById('subject');
  var topic = document.getElementById('topic');
  var status = document.getElementById('apply-status');
  var saveBtn = document.getElementById('save-application');
  var uploadBtn = document.getElementById('upload-demo');
  var submitBtn = document.getElementById('submit-application');
  var current = null;
  var subjects = [];
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

  async function loadTopics() {
    if (!subject.value) {
      topic.innerHTML = '';
      return;
    }
    var items = await Tafseel.api.get('/topics?qualificationOnly=true&subjectId=' + encodeURIComponent(subject.value));
    topic.innerHTML = items.map(function (x) {
      return '<option value="' + escape(x.id) + '">' + escape(x.name) + '</option>';
    }).join('');
  }

  async function loadApplications() {
    var items = await Tafseel.api.get('/teacher-applications/mine');
    current = items.find(function (x) { return x.status === 0 || x.status === 3; }) || items[0] || null;
    var list = document.getElementById('applications');
    list.innerHTML = items.length
      ? items.map(function (x) {
          return '<button type="button" data-id="' + escape(x.id) + '"><strong>' + escape(statusName(x.status)) +
            '</strong><br><span class="tf-muted">' + escape(String(x.id).slice(0, 8)) + '</span></button>';
        }).join('')
      : '<p class="tf-muted">' + escape(t('apply_none')) + '</p>';
    demoForm.hidden = !current || ![0, 3].includes(current.status);
  }

  subject.addEventListener('change', function () {
    loadTopics().catch(function (e) { message(Tafseel.api.errorMessage(e), 'error'); });
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (busy) return;
    var years = Number(document.getElementById('years').value);
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
      subjects = await Tafseel.api.get('/subjects');
      subject.innerHTML = subjects.map(function (x) {
        return '<option value="' + escape(x.id) + '">' + escape(x.name) + '</option>';
      }).join('');
      await loadTopics();
      await loadApplications();
    } catch (error) {
      message(Tafseel.api.errorMessage(error), 'error');
    }
  })();
})();
