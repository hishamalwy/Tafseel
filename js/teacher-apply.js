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
  var state = {
    initialLoading: true,
    topicsLoading: false,
    submitLoading: false,
    languagesError: '',
    topicsError: '',
    submitError: '',
    subjects: [],
    topics: [],
    languages: [],
    profile: null,
    applications: [],
    lifecycle: null,
    current: null
  };

  function t(key, values) {
    try { return Tafseel.t(key, values); } catch (_) { return key; }
  }

  function escape(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function message(text, kind) {
    status.textContent = text || '';
    status.dataset.kind = kind || '';
  }

  function setSubmitLoading(next) {
    state.submitLoading = !!next;
    [saveBtn, uploadBtn, submitBtn].forEach(function (button) {
      if (button) button.disabled = state.submitLoading || state.topicsLoading;
    });
    saveBtn.textContent = state.submitLoading ? t('apply_saving') : t('apply_save');
  }

  function errorText(error, fallbackKey) {
    var messages = {
      language_required: 'apply_language_required',
      language_not_found: 'apply_languages_error',
      qualification_topic_not_found: 'apply_topic_invalid',
      duplicate_teacher_application: 'apply_duplicate',
      city_required: 'apply_city_invalid',
      degree_required: 'apply_degree_invalid',
      invalid_experience: 'apply_years_invalid',
      concurrency_conflict: 'apply_concurrency_error',
      unexpected_error: 'apply_unexpected_error'
    };
    if (error instanceof TypeError && /fetch|network/i.test(error.message || ''))
      return t('network_error');
    return t(messages[error && error.code] || fallbackKey || 'apply_unexpected_error');
  }

  function catalogLabel(item) {
    return document.documentElement.lang === 'ar' && item.nameAr ? item.nameAr : item.name;
  }

  function topicLabel(item) {
    return document.documentElement.lang === 'ar' && item.titleAr ? item.titleAr : item.name;
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

  function selectedLanguageIds() {
    return Array.from(languageBox.querySelectorAll('input:checked')).map(function (input) {
      return input.value;
    });
  }

  function renderLanguages(selected) {
    var chosen = new Set(selected || selectedLanguageIds());
    languageBox.innerHTML = state.languages.map(function (language) {
      var id = 'teaching-language-' + language.id;
      return '<label for="' + escape(id) + '" style="min-height:40px;padding:8px 12px;display:inline-flex;align-items:center;gap:8px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);color:var(--text-2)">' +
        '<input id="' + escape(id) + '" type="checkbox" value="' + escape(language.id) + '"' +
        (chosen.has(language.id) ? ' checked' : '') + '><span data-i18n-skip>' +
        escape(Tafseel.languageLabel(language)) + '</span></label>';
    }).join('');
    document.getElementById('languages-error').textContent = state.languagesError;
  }

  function safeResourceUrl(value) {
    if (!value) return '';
    if (value.startsWith('/api/')) return value;
    try {
      var parsed = new URL(value, location.href);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : '';
    } catch (_) {
      return '';
    }
  }

  function resourceType(resource) {
    if (resource.contentType) return resource.contentType;
    if (!resource.isFile) return t('apply_link_type');
    var fileName = resource.fileName || '';
    var extension = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
    return extension || t('apply_file_type');
  }

  function renderAssignment() {
    var item = state.topics.find(function (entry) { return entry.id === topic.value; });
    var card = document.getElementById('assignment-details');
    if (!item) {
      card.hidden = true;
      return;
    }
    var ar = document.documentElement.lang === 'ar';
    var primaryTitle = ar && item.titleAr ? item.titleAr : item.name;
    var secondaryTitle = ar ? item.name : item.titleAr;
    var instructions = ar && item.instructionsAr ? item.instructionsAr : item.detail;
    var guidance = ar && item.evaluationGuidanceAr
      ? item.evaluationGuidanceAr
      : item.evaluationGuidance;
    var resources = (item.resources || []).map(function (resource) {
      var name = ar && resource.displayNameAr ? resource.displayNameAr : resource.displayName;
      var fileName = resource.fileName || name;
      var url = safeResourceUrl(resource.url);
      return '<li class="tf-assignment-resource"><span><strong>' + escape(name) + '</strong>' +
        '<small>' + escape(fileName) + ' · ' + escape(resourceType(resource)) +
        (resource.isRequired ? ' · ' + escape(t('apply_required_resource')) : '') +
        '</small></span>' +
        (url ? '<a class="tf-button tf-button-secondary" href="' + escape(url) +
          '" target="_blank" rel="noopener">' +
          escape(resource.isFile ? t('apply_preview_download') : t('apply_open_reference')) + '</a>' : '') +
        '</li>';
    }).join('');
    card.innerHTML = '<h2 lang="' + (ar ? 'ar' : 'en') + '" dir="' + (ar ? 'rtl' : 'ltr') + '">' +
      escape(primaryTitle) + '</h2>' +
      (secondaryTitle && secondaryTitle !== primaryTitle
        ? '<p class="tf-assignment-title-alt" lang="' + (ar ? 'en' : 'ar') + '" dir="' +
          (ar ? 'ltr' : 'rtl') + '">' + escape(secondaryTitle) + '</p>'
        : '') +
      '<h3>' + escape(t('apply_instructions')) + '</h3>' +
      '<p class="tf-assignment-instructions">' + escape(instructions || t('apply_instructions_missing')) + '</p>' +
      '<div class="tf-assignment-meta">' +
      '<span>' + escape(t('apply_minimum_duration', { seconds: item.minVideoSeconds || 30 })) + '</span>' +
      '<span>' + escape(t('apply_expected_duration', {
        seconds: item.expectedVideoSeconds || item.maxVideoSeconds || 180
      })) + '</span>' +
      '<span>' + escape(t('apply_maximum_duration', { seconds: item.maxVideoSeconds || 180 })) + '</span></div>' +
      '<h3>' + escape(t('apply_evaluation')) + '</h3>' +
      '<p class="tf-assignment-instructions">' + escape(guidance || t('apply_evaluation_missing')) + '</p>' +
      (resources
        ? '<h3>' + escape(t('apply_assignment_resources')) + '</h3><ul class="tf-assignment-resources">' +
          resources + '</ul>'
        : '<p class="tf-muted">' + escape(t('apply_no_resources')) + '</p>') +
      '<div class="tf-alert" data-kind="warning" role="note">' +
      escape(t('apply_material_warning')) + '</div>';
    card.hidden = false;
    var duration = document.getElementById('duration');
    duration.min = item.minVideoSeconds || 30;
    duration.max = item.maxVideoSeconds || 600;
    duration.value = item.expectedVideoSeconds || item.maxVideoSeconds || 180;
  }

  function renderApplications() {
    var list = document.getElementById('applications');
    list.innerHTML = state.applications.length
      ? state.applications.map(function (application) {
          return '<button type="button" data-id="' + escape(application.id) + '"><strong>' +
            escape(statusName(application.status)) + '</strong><br><span>' +
            escape(application.subjectName || '') + ' · ' + escape(application.assignmentTitle || '') + '</span>' +
            (application.publicFeedback
              ? '<br><span class="tf-muted">' + escape(application.publicFeedback) + '</span>'
              : '') + '</button>';
        }).join('')
      : '<p class="tf-muted">' + escape(t('apply_none')) + '</p>';
    list.querySelectorAll('[data-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectApplication(button.dataset.id);
      });
    });
  }

  function applyCurrentValues() {
    var current = state.current;
    subject.disabled = !!current && [0, 3].includes(current.status);
    if (current) {
      subject.value = current.subjectId;
      topic.value = current.qualificationTopicId;
      document.getElementById('city').value = current.city || '';
      document.getElementById('years').value = String(current.experienceYears || 0);
      document.getElementById('degree').value = current.degree || '';
    }
    demoForm.hidden = !current || ![0, 3].includes(current.status);
    document.getElementById('step-details').dataset.active = String(!current);
    document.getElementById('step-demo').dataset.active =
      String(!!current && [0, 3].includes(current.status));
    document.getElementById('step-review').dataset.active =
      String(!!current && ![0, 3].includes(current.status));
    if (current)
      message(current.publicFeedback || statusName(current.status), current.status === 3 ? 'warning' : '');
    renderAssignment();
  }

  function renderInitial(selectedSubjectId) {
    subject.innerHTML = state.subjects.map(function (item) {
      return '<option value="' + escape(item.id) + '">' + escape(catalogLabel(item)) + '</option>';
    }).join('');
    subject.value = selectedSubjectId || '';
    topic.innerHTML = state.topics.map(function (item) {
      return '<option value="' + escape(item.id) + '">' + escape(topicLabel(item)) + '</option>';
    }).join('');
    if (state.current) topic.value = state.current.qualificationTopicId;
    renderLanguages(((state.profile && state.profile.languages) || []).map(function (item) { return item.id; }));
    renderApplications();
    applyCurrentValues();
    var lifecycle = document.getElementById('lifecycle-status');
    lifecycle.textContent = state.lifecycle && state.lifecycle.nextAction || '';
    lifecycle.hidden = !lifecycle.textContent;
    document.getElementById('topics-error').textContent = state.topicsError;
    document.getElementById('apply-skeleton').hidden = true;
    document.getElementById('apply-content').hidden = false;
    state.initialLoading = false;
  }

  async function fetchTopics(subjectId) {
    if (!subjectId) return [];
    return Tafseel.api.get('/topics?qualificationOnly=true&subjectId=' + encodeURIComponent(subjectId));
  }

  async function loadTopics(selectedTopicId) {
    state.topicsLoading = true;
    state.topicsError = '';
    topic.disabled = true;
    topic.innerHTML = '<option>' + escape(t('apply_topics_loading')) + '</option>';
    document.getElementById('topics-error').textContent = '';
    setSubmitLoading(state.submitLoading);
    try {
      state.topics = await fetchTopics(subject.value);
      topic.innerHTML = state.topics.map(function (item) {
        return '<option value="' + escape(item.id) + '">' + escape(topicLabel(item)) + '</option>';
      }).join('');
      topic.value = selectedTopicId || (state.topics[0] && state.topics[0].id) || '';
    } catch (error) {
      state.topics = [];
      topic.innerHTML = '';
      state.topicsError = errorText(error, 'apply_topics_error');
      document.getElementById('topics-error').textContent = state.topicsError;
    } finally {
      state.topicsLoading = false;
      topic.disabled = false;
      setSubmitLoading(state.submitLoading);
      renderAssignment();
    }
  }

  async function selectApplication(id) {
    var selected = state.applications.find(function (item) { return item.id === id; });
    if (!selected) return;
    state.current = selected;
    subject.value = selected.subjectId;
    await loadTopics(selected.qualificationTopicId);
    applyCurrentValues();
  }

  async function refreshApplications() {
    state.applications = await Tafseel.api.get('/teacher-applications/mine');
    state.current = state.applications.find(function (item) {
      return item.status === 0 || item.status === 3;
    }) || state.applications[0] || null;
    renderApplications();
    applyCurrentValues();
  }

  function focusInvalid(input, text) {
    input.setCustomValidity(text);
    input.reportValidity();
    input.focus();
  }

  function validateApplication() {
    [
      subject,
      topic,
      document.getElementById('city'),
      document.getElementById('years'),
      document.getElementById('degree')
    ].forEach(function (input) {
      input.setCustomValidity('');
    });
    if (!form.checkValidity()) {
      form.reportValidity();
      var invalid = form.querySelector(':invalid');
      if (invalid) invalid.focus();
      return false;
    }
    if (!state.subjects.some(function (item) { return item.id === subject.value; })) {
      focusInvalid(subject, t('apply_subject_invalid'));
      return false;
    }
    var selectedTopic = state.topics.find(function (item) { return item.id === topic.value; });
    if (!selectedTopic || selectedTopic.parentId !== subject.value) {
      focusInvalid(topic, t('apply_topic_invalid'));
      return false;
    }
    var city = document.getElementById('city');
    var degree = document.getElementById('degree');
    if (!/\p{L}/u.test(city.value)) {
      focusInvalid(city, t('apply_city_invalid'));
      return false;
    }
    if (!/\p{L}/u.test(degree.value)) {
      focusInvalid(degree, t('apply_degree_invalid'));
      return false;
    }
    var years = Number(document.getElementById('years').value);
    if (!Number.isInteger(years) || years < 0 || years > 80) {
      focusInvalid(document.getElementById('years'), t('apply_years_invalid'));
      return false;
    }
    if (!selectedLanguageIds().length) {
      state.languagesError = t('apply_language_required');
      document.getElementById('languages-error').textContent = state.languagesError;
      var firstLanguage = languageBox.querySelector('input');
      if (firstLanguage) firstLanguage.focus();
      return false;
    }
    return true;
  }

  subject.addEventListener('change', function () {
    state.current = null;
    loadTopics().catch(function (error) {
      state.topicsError = errorText(error, 'apply_topics_error');
    });
  });
  topic.addEventListener('change', renderAssignment);
  languageBox.addEventListener('change', function () {
    state.languagesError = '';
    document.getElementById('languages-error').textContent = '';
  });
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
    if (state.submitLoading || !validateApplication()) return;
    state.submitError = '';
    document.getElementById('submit-error').textContent = '';
    var input = {
      subjectId: subject.value,
      qualificationTopicId: topic.value,
      city: document.getElementById('city').value.trim(),
      experienceYears: Number(document.getElementById('years').value),
      degree: document.getElementById('degree').value.trim()
    };
    setSubmitLoading(true);
    try {
      await Tafseel.api.put('/teachers/me/languages', { ids: selectedLanguageIds() });
      if (state.current && [0, 3].includes(state.current.status))
        await Tafseel.api.put(
          '/teacher-applications/' + state.current.id,
          input,
          { 'If-Match': state.current.version });
      else
        state.current = await Tafseel.api.post('/teacher-applications', input);
      await refreshApplications();
      message(t('apply_saved'), 'success');
    } catch (error) {
      state.submitError = errorText(error, 'apply_save_error');
      document.getElementById('submit-error').textContent = state.submitError;
      message(state.submitError, 'error');
    } finally {
      setSubmitLoading(false);
    }
  });

  demoForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!state.current || state.submitLoading) return;
    var file = document.getElementById('demo').files[0];
    var duration = Number(document.getElementById('duration').value);
    if (!file) {
      message(t('apply_demo_file'), 'error');
      document.getElementById('demo').focus();
      return;
    }
    if (!Number.isFinite(duration) || duration < 1 || duration > 600) {
      message(t('apply_duration'), 'error');
      document.getElementById('duration').focus();
      return;
    }
    var data = new FormData();
    data.append('file', file);
    data.append('durationSeconds', String(duration));
    setSubmitLoading(true);
    try {
      await Tafseel.api.upload(
        '/teacher-applications/' + state.current.id + '/demo',
        data,
        { 'If-Match': state.current.version });
      await refreshApplications();
      message(t('apply_demo_uploaded'), 'success');
    } catch (error) {
      message(errorText(error, 'apply_demo_error'), 'error');
    } finally {
      setSubmitLoading(false);
    }
  });

  submitBtn.addEventListener('click', async function () {
    if (!state.current || state.submitLoading) return;
    setSubmitLoading(true);
    try {
      await Tafseel.api.post(
        '/teacher-applications/' + state.current.id + '/submit',
        null,
        { 'If-Match': state.current.version });
      await refreshApplications();
      message(t('apply_submitted'), 'success');
    } catch (error) {
      message(errorText(error, 'apply_submit_error'), 'error');
    } finally {
      setSubmitLoading(false);
    }
  });

  document.addEventListener('tafseel:change', function () {
    var subjectId = subject.value;
    var topicId = topic.value;
    var languageIds = selectedLanguageIds();
    subject.innerHTML = state.subjects.map(function (item) {
      return '<option value="' + escape(item.id) + '">' + escape(catalogLabel(item)) + '</option>';
    }).join('');
    subject.value = subjectId;
    topic.innerHTML = state.topics.map(function (item) {
      return '<option value="' + escape(item.id) + '">' + escape(topicLabel(item)) + '</option>';
    }).join('');
    topic.value = topicId;
    renderLanguages(languageIds);
    renderApplications();
    renderAssignment();
  });

  (async function () {
    var session = await Tafseel.api.ready();
    if (!session) return location.replace('Tafseel-Auth.dc.html');
    if (!(session.roles || []).includes('Teacher')) {
      document.getElementById('apply-skeleton').hidden = true;
      document.getElementById('apply-content').hidden = false;
      message(t('apply_teacher_required'), 'error');
      return;
    }

    var loaded = await Promise.allSettled([
      Tafseel.api.get('/subjects'),
      Tafseel.api.get('/languages'),
      Tafseel.api.get('/teachers/me'),
      Tafseel.api.get('/teacher-applications/mine'),
      Tafseel.api.get('/teachers/onboarding-status')
    ]);
    var nextSubjects = loaded[0].status === 'fulfilled' ? loaded[0].value : [];
    var nextLanguages = loaded[1].status === 'fulfilled' ? loaded[1].value : [];
    var nextProfile = loaded[2].status === 'fulfilled' ? loaded[2].value : null;
    var nextApplications = loaded[3].status === 'fulfilled' ? loaded[3].value : [];
    var nextLifecycle = loaded[4].status === 'fulfilled' ? loaded[4].value : null;
    var nextCurrent = nextApplications.find(function (item) {
      return item.status === 0 || item.status === 3;
    }) || nextApplications[0] || null;
    var selectedSubjectId = nextCurrent && nextCurrent.subjectId ||
      nextSubjects[0] && nextSubjects[0].id || '';
    var nextTopics = [];
    var topicsError = '';
    if (selectedSubjectId) {
      try {
        nextTopics = await fetchTopics(selectedSubjectId);
      } catch (error) {
        topicsError = errorText(error, 'apply_topics_error');
      }
    }

    Object.assign(state, {
      subjects: nextSubjects,
      languages: nextLanguages,
      profile: nextProfile,
      applications: nextApplications,
      lifecycle: nextLifecycle,
      current: nextCurrent,
      topics: nextTopics,
      languagesError: loaded[1].status === 'rejected' || loaded[2].status === 'rejected'
        ? t('apply_languages_error')
        : '',
      topicsError: topicsError
    });
    if (loaded[0].status === 'rejected' || loaded[3].status === 'rejected')
      message(t('apply_initial_partial_error'), 'warning');
    renderInitial(selectedSubjectId);
  })().catch(function (error) {
    document.getElementById('apply-skeleton').hidden = true;
    document.getElementById('apply-content').hidden = false;
    message(errorText(error, 'apply_initial_error'), 'error');
  });
})();
