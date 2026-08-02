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
    selectableSubjects: [],
    topics: [],
    languages: [],
    profile: null,
    applications: [],
    lifecycle: null,
    qualifications: [],
    additionalMode: false,
    current: null,
    demoDuration: null,
    demoDurationInvalid: false,
    wizardStep: 'details'
  };

  function queryMode() {
    try {
      return new URLSearchParams(window.location.search).get('mode') === 'additional';
    } catch (_) {
      return false;
    }
  }

  function querySubjectId() {
    try {
      return new URLSearchParams(window.location.search).get('subjectId') || '';
    } catch (_) {
      return '';
    }
  }

  function isActiveApplicationStatus(status) {
    return status === 0 || status === 1 || status === 2 || status === 3;
  }

  function buildSelectableSubjects(allSubjects, applications, lifecycle, qualifications) {
    var approved = {};
    ((lifecycle && lifecycle.approvedSubjectIds) || []).forEach(function (id) { approved[id] = true; });
    (qualifications || []).forEach(function (card) {
      if (card.state === 0) approved[card.subjectId] = true;
    });
    var activeApps = {};
    (applications || []).forEach(function (app) {
      if (isActiveApplicationStatus(app.status)) activeApps[app.subjectId] = true;
    });
    return (allSubjects || []).map(function (item) {
      var reason = '';
      if (approved[item.id]) reason = 'apply_subject_already_qualified';
      else if (activeApps[item.id]) reason = 'apply_subject_application_active';
      return {
        id: item.id,
        name: item.name,
        nameAr: item.nameAr,
        disabled: !!reason,
        reason: reason
      };
    });
  }

  function t(key, values) {
    try { return Tafseel.t(key, values); } catch (_) { return key; }
  }

  function escape(value) {
    var node = document.createElement('div');
    node.textContent = value == null ? '' : String(value);
    return node.innerHTML;
  }

  function formatDuration(totalSeconds) {
    var seconds = Math.max(0, Math.round(totalSeconds || 0));
    var minutes = Math.floor(seconds / 60);
    var remainder = seconds % 60;
    return minutes + ':' + (remainder < 10 ? '0' : '') + remainder;
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function getCurrentTopic() {
    return state.topics.find(function (entry) { return entry.id === topic.value; });
  }

  function message(text, kind) {
    status.textContent = text || '';
    status.dataset.kind = kind || '';
  }

  function isDemoReady() {
    return !!(state.current && state.current.demoUploaded);
  }

  function syncDemoActions() {
    if (!uploadBtn || !submitBtn) return;
    var ready = isDemoReady();
    var actions = submitBtn.parentElement;
    uploadBtn.classList.toggle('tf-button-secondary', ready);
    submitBtn.classList.toggle('tf-button-secondary', !ready);
    if (actions) {
      actions.dataset.demoReady = ready ? 'true' : 'false';
      if (ready) actions.insertBefore(submitBtn, uploadBtn);
      else actions.insertBefore(uploadBtn, submitBtn);
    }
  }

  function setSubmitLoading(next) {
    state.submitLoading = !!next;
    var ready = isDemoReady();
    saveBtn.disabled = state.submitLoading || state.topicsLoading;
    submitBtn.disabled = state.submitLoading || state.topicsLoading || !ready;
    uploadBtn.disabled = state.submitLoading || state.topicsLoading || state.demoDurationInvalid;
    saveBtn.textContent = state.submitLoading ? t('apply_saving') : t('apply_save_continue');
    uploadBtn.textContent = state.submitLoading && !ready
      ? t('apply_demo_uploading')
      : t(ready ? 'apply_demo_reupload' : 'apply_upload_demo');
    submitBtn.textContent = state.submitLoading && ready
      ? t('apply_submitting')
      : t('apply_submit_review');
    syncDemoActions();
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
    if (document.documentElement.lang === 'ar')
      return item.titleAr || item.nameAr || item.name;
    return item.name;
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
      return '<label for="' + escape(id) + '" class="tf-lang-chip">' +
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

  function apiPathFromUrl(url) {
    if (!url) return '';
    if (url.indexOf('/api/v1/') === 0) return url.slice('/api/v1'.length);
    try {
      var parsed = new URL(url, location.href);
      if (parsed.pathname.indexOf('/api/v1/') === 0)
        return parsed.pathname.slice('/api/v1'.length) + parsed.search;
    } catch (_) {}
    return '';
  }

  async function openProtectedResource(url, opts) {
    var path = apiPathFromUrl(url);
    if (!path) throw new Error(t('apply_resource_open_failed'));
    await Tafseel.api.openBlob(path, opts || {});
  }

  function bindResourceActions(root) {
    if (!root) return;
    root.querySelectorAll('[data-resource-action]').forEach(function (button) {
      button.addEventListener('click', async function () {
        var action = button.getAttribute('data-resource-action');
        var url = button.getAttribute('data-resource-url') || '';
        var fileName = button.getAttribute('data-resource-name') || '';
        button.disabled = true;
        try {
          await openProtectedResource(url, {
            download: action === 'download',
            fileName: fileName || undefined
          });
        } catch (error) {
          message(Tafseel.api.errorMessage(error) || t('apply_resource_open_failed'), 'error');
        } finally {
          button.disabled = false;
        }
      });
    });
  }

  function resourceType(resource) {
    if (resource.contentType) return resource.contentType;
    if (!resource.isFile) return t('apply_link_type');
    var fileName = resource.fileName || '';
    var extension = fileName.includes('.') ? fileName.split('.').pop().toUpperCase() : '';
    return extension || t('apply_file_type');
  }

  function renderAssignment() {
    var item = getCurrentTopic();
    var card = document.getElementById('assignment-details');
    var durationRules = document.getElementById('demo-duration-rules');
    if (!item || state.wizardStep !== 'demo') {
      if (card) card.hidden = true;
      if (!item && durationRules) durationRules.textContent = '';
      return;
    }
    var minSeconds = item.minVideoSeconds || 30;
    var maxSeconds = item.maxVideoSeconds || 600;
    var expectedSeconds = item.expectedVideoSeconds || maxSeconds;
    var requiredRange = t('apply_duration_required', {
      range: formatDuration(minSeconds) + '–' + formatDuration(maxSeconds)
    });
    var recommended = t('apply_duration_recommended', { value: formatDuration(expectedSeconds) });
    durationRules.textContent = requiredRange + ' · ' + recommended;
    var ar = document.documentElement.lang === 'ar';
    var primaryTitle = ar
      ? (item.titleAr || item.nameAr || item.name)
      : item.name;
    var secondaryTitle = ar ? item.name : (item.titleAr || item.nameAr);
    var instructions = ar && item.instructionsAr ? item.instructionsAr : item.detail;
    var guidance = ar && item.evaluationGuidanceAr
      ? item.evaluationGuidanceAr
      : item.evaluationGuidance;
    var resources = (item.resources || []).map(function (resource) {
      var name = ar && resource.displayNameAr ? resource.displayNameAr : resource.displayName;
      var fileName = resource.fileName || name;
      var url = safeResourceUrl(resource.url);
      var meta = [];
      if (fileName && fileName !== name) meta.push(fileName);
      meta.push(resourceType(resource));
      if (resource.isRequired) meta.push(t('apply_required_resource'));
      var icon = resource.isFile
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h6"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5"/><path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.4a5 5 0 0 0 7.07 7.07L14 19"/></svg>';
      var actions = '';
      if (url && resource.isFile) {
        actions =
          '<div class="tf-assignment-resource-actions">' +
          '<button type="button" class="tf-button tf-button-secondary" data-resource-action="preview" data-resource-url="' + escape(url) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>' +
          escape(t('apply_preview')) + '</button>' +
          '<button type="button" class="tf-button" data-resource-action="download" data-resource-url="' + escape(url) + '" data-resource-name="' + escape(fileName) + '">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>' +
          escape(t('apply_download')) + '</button>' +
          '</div>';
      } else if (url) {
        actions =
          '<div class="tf-assignment-resource-actions">' +
          '<a class="tf-button tf-button-secondary" href="' + escape(url) + '" target="_blank" rel="noopener">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>' +
          escape(t('apply_open_reference')) + '</a></div>';
      }
      return '<li class="tf-assignment-resource"><div class="tf-assignment-resource-main">' +
        '<span class="tf-assignment-resource-icon">' + icon + '</span>' +
        '<span class="tf-assignment-resource-copy"><strong>' + escape(name) + '</strong>' +
        '<small>' + escape(meta.join(' · ')) + '</small></span></div>' + actions + '</li>';
    }).join('');
    card.innerHTML = '<h2 lang="' + (ar ? 'ar' : 'en') + '" dir="' + (ar ? 'rtl' : 'ltr') + '">' +
      escape(primaryTitle) + '</h2>' +
      (secondaryTitle && secondaryTitle !== primaryTitle
        ? '<p class="tf-assignment-title-alt" lang="' + (ar ? 'en' : 'ar') + '" dir="' +
          (ar ? 'ltr' : 'rtl') + '">' + escape(secondaryTitle) + '</p>'
        : '') +
      '<h3>' + escape(t('apply_overview')) + '</h3>' +
      '<div class="tf-assignment-meta">' +
      '<span class="tf-badge">' + escape(requiredRange) + '</span>' +
      '<span class="tf-badge">' + escape(recommended) + '</span>' +
      '<span class="tf-badge">' + escape(t('apply_allowed_format')) + '</span></div>' +
      '<h3>' + escape(t('apply_important_notes')) + '</h3>' +
      '<div class="tf-alert" data-kind="warning" role="note">' +
      escape(t('apply_material_warning')) + '</div>' +
      '<h3>' + escape(t('apply_instructions')) + '</h3>' +
      '<p class="tf-assignment-instructions">' + escape(instructions || t('apply_instructions_missing')) + '</p>' +
      '<h3>' + escape(t('apply_evaluation')) + '</h3>' +
      '<p class="tf-assignment-instructions">' + escape(guidance || t('apply_evaluation_missing')) + '</p>' +
      (resources
        ? '<h3>' + escape(t('apply_assignment_resources')) + '</h3><ul class="tf-assignment-resources">' +
          resources + '</ul>'
        : '<h3>' + escape(t('apply_assignment_resources')) + '</h3><p class="tf-empty">' +
          escape(t('apply_no_resources')) + '</p>');
    card.hidden = false;
    bindResourceActions(card);
    validateSelectedDemoDuration();
  }

  function statusKind(value) {
    if (value === 0) return 'draft';
    if (value === 1 || value === 2) return 'pending';
    if (value === 3) return 'warning';
    if (value === 4) return 'success';
    if (value === 5 || value === 6) return 'error';
    return 'draft';
  }

  function applicationSubjectLabel(application) {
    var catalog = state.subjects.find(function (item) { return item.id === application.subjectId; });
    if (catalog) return catalogLabel(catalog);
    var ar = document.documentElement.lang === 'ar';
    if (ar && application.subjectNameAr) return application.subjectNameAr;
    return application.subjectName || t('apply_subject');
  }

  function applicationTopicLabel(application) {
    var catalog = state.topics.find(function (item) {
      return item.id === application.qualificationTopicId;
    });
    if (catalog) return topicLabel(catalog);
    var ar = document.documentElement.lang === 'ar';
    if (ar && application.assignmentTitleAr) return application.assignmentTitleAr;
    return application.assignmentTitle || '';
  }

  function renderApplications() {
    var list = document.getElementById('applications');
    list.innerHTML = state.applications.length
      ? state.applications.map(function (application) {
          var active = state.current && state.current.id === application.id;
          var subjectLabel = applicationSubjectLabel(application);
          var topicLabelText = applicationTopicLabel(application);
          var detailParts = [];
          if (topicLabelText) detailParts.push(topicLabelText);
          if (application.city) detailParts.push(application.city);
          return '<button type="button" class="tf-apply-app' + (active ? ' is-active' : '') +
            '" data-id="' + escape(application.id) + '">' +
            '<span class="tf-apply-app-copy">' +
            '<strong>' + escape(subjectLabel) + '</strong>' +
            '<span>' + escape(detailParts.join(' · ') || statusName(application.status)) +
            (application.publicFeedback
              ? '<br>' + escape(application.publicFeedback)
              : '') +
            '</span></span>' +
            '<span class="tf-apply-app-status" data-kind="' + escape(statusKind(application.status)) + '">' +
            escape(statusName(application.status)) + '</span></button>';
        }).join('')
      : '';
    list.hidden = state.applications.length === 0 || state.wizardStep === 'demo';
    list.querySelectorAll('[data-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        selectApplication(button.dataset.id);
      });
    });
  }

  function defaultWizardStep(current) {
    if (!current) return 'details';
    if ([1, 2, 4, 5, 6].includes(current.status)) return 'review';
    if (current.status === 0 || current.status === 3) return 'demo';
    return 'details';
  }

  function renderReviewPanel(current) {
    var badge = document.getElementById('review-status-badge');
    var title = document.getElementById('review-title');
    var body = document.getElementById('review-body');
    var meta = document.getElementById('review-meta');
    var newBtn = document.getElementById('review-new-application');
    if (!current) {
      badge.textContent = '';
      meta.innerHTML = '';
      newBtn.hidden = true;
      return;
    }
    badge.textContent = statusName(current.status);
    if (current.status === 4) {
      title.textContent = t('apply_review_approved_title');
      body.textContent = t('apply_review_approved_body');
    } else if (current.status === 5) {
      title.textContent = t('apply_review_rejected_title');
      body.textContent = t('apply_review_rejected_body');
    } else if (current.status === 3) {
      title.textContent = t('apply_review_changes_title');
      body.textContent = current.publicFeedback || t('apply_review_changes_body');
    } else {
      title.textContent = t('apply_review_pending_title');
      body.textContent = t('apply_review_pending_body');
    }
    meta.innerHTML =
      '<div><dt>' + escape(t('apply_subject')) + '</dt><dd>' + escape(applicationSubjectLabel(current) || '—') + '</dd></div>' +
      '<div><dt>' + escape(t('apply_topic')) + '</dt><dd>' + escape(applicationTopicLabel(current) || '—') + '</dd></div>' +
      '<div><dt>' + escape(t('apply_status_label')) + '</dt><dd>' + escape(statusName(current.status)) + '</dd></div>';
    newBtn.hidden = [0, 3].includes(current.status);
  }

  function placeAssignmentCard() {
    var card = document.getElementById('assignment-details');
    var demoSlot = document.getElementById('assignment-slot-demo');
    if (!card || !demoSlot) return;
    if (card.parentElement !== demoSlot) demoSlot.appendChild(card);
  }

  function showWizardStep(step) {
    state.wizardStep = step;
    var panelDetails = document.getElementById('panel-details');
    var panelDemo = document.getElementById('panel-demo');
    var panelReview = document.getElementById('panel-review');
    var assignment = document.getElementById('assignment-details');
    var guidelines = document.querySelector('.tf-apply-guidelines');
    panelDetails.hidden = step !== 'details';
    panelDemo.hidden = step !== 'demo';
    panelReview.hidden = step !== 'review';
    if (guidelines) guidelines.hidden = step === 'review';
    if (step === 'demo') {
      placeAssignmentCard();
      renderAssignment();
    } else if (assignment) {
      assignment.hidden = true;
    }
    renderApplications();
    renderStepper(state.current);
    syncDemoActions();
    if (step === 'review') renderReviewPanel(state.current);
  }

  var STEPS = [
    { id: 'step-details', key: 'details', labelKey: 'apply_step_label_details' },
    { id: 'step-demo', key: 'demo', labelKey: 'apply_step_label_demo' },
    { id: 'step-review', key: 'review', labelKey: 'apply_step_label_review' }
  ];
  var STEP_STATE_KEYS = {
    current: 'apply_step_state_current',
    completed: 'apply_step_state_completed',
    locked: 'apply_step_state_locked',
    error: 'apply_step_state_error'
  };

  STEPS.forEach(function (entry) {
    bindStepNavigation(document.getElementById(entry.id), entry.key);
  });

  function canVisitStep(step, current) {
    if (step === 'details') return !current || [0, 3].includes(current.status);
    if (step === 'demo') return !!(current && [0, 3].includes(current.status));
    if (step === 'review') return !!(current && [1, 2, 4, 5, 6].includes(current.status));
    return false;
  }

  function goToWizardStep(step) {
    if (state.submitLoading || !canVisitStep(step, state.current) || step === state.wizardStep) return;
    showWizardStep(step);
  }

  function bindStepNavigation(el, step) {
    if (!el) return;
    el.addEventListener('click', function () {
      goToWizardStep(step);
    });
    el.addEventListener('keydown', function (event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      goToWizardStep(step);
    });
  }

  function renderStepper(current) {
    var step = state.wizardStep || defaultWizardStep(current);
    var states = { details: 'locked', demo: 'locked', review: 'locked' };
    if (step === 'details') {
      states.details = 'current';
      if (canVisitStep('demo', current))
        states.demo = current && current.status === 3 ? 'error' : 'completed';
      if (canVisitStep('review', current)) states.review = 'completed';
    } else if (step === 'demo') {
      states.details = canVisitStep('details', current) ? 'completed' : 'locked';
      states.demo = current && current.status === 3 ? 'error' : 'current';
      if (canVisitStep('review', current)) states.review = 'completed';
    } else {
      states.review = 'current';
      if (canVisitStep('details', current)) states.details = 'completed';
      if (canVisitStep('demo', current)) states.demo = 'completed';
    }

    var currentIndex = Math.max(0, STEPS.findIndex(function (entry) { return entry.key === step; }));
    STEPS.forEach(function (entry) {
      var el = document.getElementById(entry.id);
      var stateValue = states[entry.key];
      var reachable = canVisitStep(entry.key, current);
      el.dataset.state = stateValue;
      el.classList.toggle('is-clickable', reachable && entry.key !== step);
      if (reachable && entry.key !== step) {
        el.setAttribute('role', 'button');
        el.tabIndex = 0;
        el.setAttribute('aria-disabled', 'false');
      } else {
        el.removeAttribute('role');
        el.removeAttribute('tabIndex');
        el.setAttribute('aria-disabled', reachable ? 'false' : 'true');
      }
      if (stateValue === 'current' || stateValue === 'error')
        el.setAttribute('aria-current', 'step');
      else el.removeAttribute('aria-current');
      document.getElementById(entry.id + '-state').textContent = t(STEP_STATE_KEYS[stateValue]);
    });

    var summary = document.getElementById('step-summary');
    summary.innerHTML = STEPS.map(function (entry, index) {
      var shortLabel = (index + 1) + '. ' + t(entry.labelKey);
      var reachable = canVisitStep(entry.key, current);
      if (reachable) {
        return '<button type="button" class="tf-apply-step-jump' +
          (entry.key === step ? ' is-current' : '') +
          '" data-step="' + escape(entry.key) + '">' + escape(shortLabel) + '</button>';
      }
      return '<span class="tf-apply-step-jump is-locked">' + escape(shortLabel) + '</span>';
    }).join('<span class="tf-apply-step-jump-sep" aria-hidden="true">·</span>');
    summary.querySelectorAll('[data-step]').forEach(function (button) {
      button.addEventListener('click', function () {
        goToWizardStep(button.dataset.step);
      });
    });
    document.getElementById('step-progress-fill').style.setProperty(
      '--tf-apply-progress-scale', String((currentIndex + 1) / STEPS.length));
  }

  function renderLifecycle() {
    var lifecycle = document.getElementById('lifecycle-status');
    lifecycle.textContent = state.lifecycle
      ? Tafseel.localizeText(state.lifecycle.nextAction || '')
      : '';
    lifecycle.hidden = !lifecycle.textContent;
  }

  function applyCurrentValues(options) {
    var current = state.current;
    var step = options && options.step ? options.step : defaultWizardStep(current);
    subject.disabled = !!current && [0, 3].includes(current.status);
    if (current) {
      subject.value = current.subjectId;
      topic.value = current.qualificationTopicId;
      document.getElementById('city').value = current.city || '';
      document.getElementById('years').value = String(current.experienceYears || 0);
    }
    if (current && current.status === 3 && current.publicFeedback)
      message(current.publicFeedback, 'warning');
    else if (!(options && options.keepMessage))
      message('');
    showWizardStep(step);
  }

  function renderInitial(selectedSubjectId) {
    subject.innerHTML = (state.selectableSubjects.length ? state.selectableSubjects : state.subjects).map(function (item) {
      var label = catalogLabel(item);
      if (item.disabled && item.reason) label += ' — ' + t(item.reason);
      return '<option value="' + escape(item.id) + '"' + (item.disabled ? ' disabled' : '') + '>' + escape(label) + '</option>';
    }).join('');
    subject.value = selectedSubjectId || '';
    topic.innerHTML = state.topics.map(function (item) {
      return '<option value="' + escape(item.id) + '">' + escape(topicLabel(item)) + '</option>';
    }).join('');
    if (state.current) topic.value = state.current.qualificationTopicId;
    renderLanguages(((state.profile && state.profile.languages) || []).map(function (item) { return item.id; }));
    renderApplications();
    applyCurrentValues();
    renderLifecycle();
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

  async function refreshApplications(options) {
    var preferredId = options && options.applicationId
      || (state.current && state.current.id)
      || null;
    state.applications = await Tafseel.api.get('/teacher-applications/mine');
    state.current = (preferredId && state.applications.find(function (item) {
      return item.id === preferredId;
    })) || state.applications.find(function (item) {
      return item.status === 0 || item.status === 3;
    }) || state.applications[0] || null;
    applyCurrentValues({
      step: options && options.step,
      keepMessage: !!(options && options.keepMessage)
    });
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
      document.getElementById('years')
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
    if (!/\p{L}/u.test(city.value)) {
      focusInvalid(city, t('apply_city_invalid'));
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
    subject.disabled = false;
    showWizardStep('details');
    loadTopics().catch(function (error) {
      state.topicsError = errorText(error, 'apply_topics_error');
    });
  });
  topic.addEventListener('change', renderAssignment);
  languageBox.addEventListener('change', function () {
    state.languagesError = '';
    document.getElementById('languages-error').textContent = '';
  });
  var demoInput = document.getElementById('demo');
  var demoDrop = document.getElementById('demo-drop');
  var demoFileInfo = document.getElementById('demo-file-info');
  var demoFileName = document.getElementById('demo-file-name');
  var demoFileMeta = document.getElementById('demo-file-meta');
  var demoFileState = document.getElementById('demo-file-state');

  function setDemoFileState(text, kind) {
    demoFileState.textContent = text || '';
    demoFileInfo.dataset.kind = kind || '';
  }

  function syncDemoDropVisibility() {
    if (!demoDrop) return;
    var hasFile = !!(demoInput.files && demoInput.files[0]);
    demoDrop.hidden = hasFile;
    if (!hasFile) demoDrop.classList.remove('is-dragover');
  }

  function fallbackDurationSeconds(assignment) {
    var min = (assignment && assignment.minVideoSeconds) || 30;
    var max = (assignment && assignment.maxVideoSeconds) || 600;
    var expected = (assignment && assignment.expectedVideoSeconds) || min;
    return Math.min(max, Math.max(min, expected));
  }

  function markDurationUnknown() {
    state.demoDuration = null;
    state.demoDurationInvalid = false;
    setDemoFileState(t('apply_demo_duration_unknown'), 'warning');
    setSubmitLoading(state.submitLoading);
  }

  function validateSelectedDemoDuration() {
    if (!demoInput.files[0] || state.demoDuration == null) return;
    var assignment = getCurrentTopic();
    var min = (assignment && assignment.minVideoSeconds) || 0;
    var max = (assignment && assignment.maxVideoSeconds) || 600;
    if (state.demoDuration < min || state.demoDuration > max) {
      state.demoDurationInvalid = true;
      setDemoFileState(t('apply_duration_out_of_range', {
        min: formatDuration(min), max: formatDuration(max)
      }), 'error');
    } else {
      state.demoDurationInvalid = false;
      setDemoFileState(t('apply_demo_meta', {
        size: formatFileSize(demoInput.files[0].size), duration: formatDuration(state.demoDuration)
      }), '');
    }
    setSubmitLoading(state.submitLoading);
  }

  demoInput.addEventListener('change', function () {
    var file = this.files[0];
    state.demoDuration = null;
    state.demoDurationInvalid = false;
    if (!file) {
      demoFileInfo.hidden = true;
      syncDemoDropVisibility();
      setSubmitLoading(state.submitLoading);
      return;
    }
    demoFileName.textContent = file.name;
    demoFileMeta.textContent = formatFileSize(file.size);
    setDemoFileState(t('apply_demo_extracting'), '');
    demoFileInfo.hidden = false;
    syncDemoDropVisibility();
    var video = document.createElement('video');
    var url = URL.createObjectURL(file);
    video.preload = 'metadata';
    video.onloadedmetadata = function () {
      URL.revokeObjectURL(url);
      if (this.files[0] !== file) return;
      var seconds = Math.round(video.duration);
      if (!Number.isFinite(seconds) || seconds < 1) {
        markDurationUnknown();
        return;
      }
      state.demoDuration = seconds;
      validateSelectedDemoDuration();
    }.bind(this);
    video.onerror = function () {
      URL.revokeObjectURL(url);
      if (this.files[0] !== file) return;
      markDurationUnknown();
    }.bind(this);
    video.src = url;
  });

  if (demoDrop) {
    ['dragenter', 'dragover'].forEach(function (type) {
      demoDrop.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        demoDrop.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (type) {
      demoDrop.addEventListener(type, function (event) {
        event.preventDefault();
        event.stopPropagation();
        demoDrop.classList.remove('is-dragover');
      });
    });
    demoDrop.addEventListener('drop', function (event) {
      var files = event.dataTransfer && event.dataTransfer.files;
      if (!files || !files.length) return;
      try {
        var transfer = new DataTransfer();
        transfer.items.add(files[0]);
        demoInput.files = transfer.files;
        demoInput.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (_) {
        demoInput.click();
      }
    });
  }

  document.getElementById('demo-file-replace').addEventListener('click', function () {
    demoInput.click();
  });

  document.getElementById('demo-file-remove').addEventListener('click', function () {
    demoInput.value = '';
    state.demoDuration = null;
    state.demoDurationInvalid = false;
    demoFileInfo.hidden = true;
    syncDemoDropVisibility();
    setSubmitLoading(state.submitLoading);
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
      degree: (state.current && state.current.degree) || ''
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
      await refreshApplications({
        applicationId: state.current && state.current.id,
        step: 'demo',
        keepMessage: true
      });
      message(t('apply_saved_continue'), 'success');
    } catch (error) {
      state.submitError = errorText(error, 'apply_save_error');
      document.getElementById('submit-error').textContent = state.submitError;
      message(state.submitError, 'error');
    } finally {
      setSubmitLoading(false);
    }
  });

  document.getElementById('review-new-application').addEventListener('click', function () {
    if (state.submitLoading) return;
    state.current = null;
    state.additionalMode = true;
    state.selectableSubjects = buildSelectableSubjects(
      state.subjects, state.applications, state.lifecycle, state.qualifications);
    subject.disabled = false;
    document.getElementById('city').value = '';
    document.getElementById('years').value = '';
    demoInput.value = '';
    state.demoDuration = null;
    state.demoDurationInvalid = false;
    demoFileInfo.hidden = true;
    syncDemoDropVisibility();
    message(t('apply_another_subject_intro'), 'success');
    showWizardStep('details');
    var first = (state.selectableSubjects.find(function (item) { return !item.disabled; }) || {}).id || '';
    subject.innerHTML = state.selectableSubjects.map(function (item) {
      var label = catalogLabel(item);
      if (item.disabled && item.reason) label += ' — ' + t(item.reason);
      return '<option value="' + escape(item.id) + '"' + (item.disabled ? ' disabled' : '') + '>' + escape(label) + '</option>';
    }).join('');
    if (first) {
      subject.value = first;
      subject.dispatchEvent(new Event('change'));
    }
  });

  demoForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!state.current || state.submitLoading) return;
    var file = demoInput.files[0];
    if (!file) {
      message(t('apply_demo_file'), 'error');
      demoInput.focus();
      return;
    }
    var assignment = getCurrentTopic();
    var min = (assignment && assignment.minVideoSeconds) || 0;
    var max = (assignment && assignment.maxVideoSeconds) || 600;
    var durationUnknown = state.demoDuration == null;
    var durationSeconds = durationUnknown
      ? fallbackDurationSeconds(assignment)
      : state.demoDuration;
    if (!durationUnknown && (durationSeconds < min || durationSeconds > max)) {
      message(t('apply_duration_out_of_range', { min: formatDuration(min), max: formatDuration(max) }), 'error');
      return;
    }
    var data = new FormData();
    data.append('file', file);
    data.append('durationSeconds', String(durationSeconds));
    setSubmitLoading(true);
    document.getElementById('demo-file-replace').disabled = true;
    document.getElementById('demo-file-remove').disabled = true;
    setDemoFileState(t('apply_demo_uploading'), '');
    try {
      await Tafseel.api.upload(
        '/teacher-applications/' + state.current.id + '/demo',
        data,
        { 'If-Match': state.current.version });
      await refreshApplications({
        applicationId: state.current && state.current.id,
        step: 'demo',
        keepMessage: true
      });
      setDemoFileState(
        durationUnknown ? t('apply_demo_uploaded_duration_unknown') : t('apply_demo_uploaded'),
        durationUnknown ? 'warning' : 'success');
      message(
        durationUnknown ? t('apply_demo_uploaded_duration_unknown') : t('apply_demo_uploaded'),
        durationUnknown ? 'warning' : 'success');
    } catch (error) {
      var demoErrorText = error && error.code === 'invalid_demo_duration'
        ? t('apply_duration_out_of_range', { min: formatDuration(min), max: formatDuration(max) })
        : errorText(error, 'apply_demo_error');
      setDemoFileState(demoErrorText, 'error');
      message(demoErrorText, 'error');
    } finally {
      setSubmitLoading(false);
      document.getElementById('demo-file-replace').disabled = false;
      document.getElementById('demo-file-remove').disabled = false;
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
      await refreshApplications({
        applicationId: state.current && state.current.id,
        step: 'review',
        keepMessage: true
      });
      message(t('apply_submitted'), 'success');
    } catch (error) {
      message(errorText(error, 'apply_submit_error'), 'error');
    } finally {
      setSubmitLoading(false);
    }
  });

  document.getElementById('logout-button').addEventListener('click', async function () {
    await Tafseel.api.logout().catch(function () {});
    location.replace('Tafseel-Auth.dc.html');
  });

  document.addEventListener('tafseel:change', function () {
    var subjectId = subject.value;
    var topicId = topic.value;
    var languageIds = selectedLanguageIds();
    subject.innerHTML = (state.selectableSubjects.length ? state.selectableSubjects : state.subjects).map(function (item) {
      var label = catalogLabel(item);
      if (item.disabled && item.reason) label += ' — ' + t(item.reason);
      return '<option value="' + escape(item.id) + '"' + (item.disabled ? ' disabled' : '') + '>' + escape(label) + '</option>';
    }).join('');
    subject.value = subjectId;
    topic.innerHTML = state.topics.map(function (item) {
      return '<option value="' + escape(item.id) + '">' + escape(topicLabel(item)) + '</option>';
    }).join('');
    topic.value = topicId;
    renderLanguages(languageIds);
    renderApplications();
    renderAssignment();
    renderLifecycle();
    renderStepper(state.current);
    syncDemoActions();
    if (state.wizardStep === 'review') renderReviewPanel(state.current);
  });

  (async function () {
    var session = await Tafseel.api.ready();
    if (!session) return location.replace('Tafseel-Auth.dc.html');
    if (!(session.roles || []).includes('Teacher')) {
      document.getElementById('apply-skeleton').hidden = true;
      document.getElementById('apply-content').hidden = false;
      document.getElementById('panel-details').hidden = true;
      document.getElementById('panel-demo').hidden = true;
      document.getElementById('panel-review').hidden = true;
      message(t('apply_teacher_required'), 'error');
      return;
    }

    var loaded = await Promise.allSettled([
      Tafseel.api.get('/subjects'),
      Tafseel.api.get('/languages'),
      Tafseel.api.get('/teachers/me'),
      Tafseel.api.get('/teacher-applications/mine'),
      Tafseel.api.get('/teachers/onboarding-status'),
      Tafseel.api.get('/teachers/me/qualifications')
    ]);
    var nextSubjects = loaded[0].status === 'fulfilled' ? loaded[0].value : [];
    var nextLanguages = loaded[1].status === 'fulfilled' ? loaded[1].value : [];
    var nextProfile = loaded[2].status === 'fulfilled' ? loaded[2].value : null;
    var nextApplications = loaded[3].status === 'fulfilled' ? loaded[3].value : [];
    var nextLifecycle = loaded[4].status === 'fulfilled' ? loaded[4].value : null;
    var nextQualifications = loaded[5].status === 'fulfilled' ? loaded[5].value : [];
    var additionalMode = queryMode();
    var preferredSubjectId = querySubjectId();
    var selectable = buildSelectableSubjects(
      nextSubjects, nextApplications, nextLifecycle, nextQualifications);
    var nextCurrent = additionalMode
      ? null
      : (nextApplications.find(function (item) {
          return item.status === 0 || item.status === 3;
        }) || nextApplications[0] || null);
    var selectedSubjectId = (nextCurrent && nextCurrent.subjectId)
      || (preferredSubjectId && selectable.some(function (item) {
        return item.id === preferredSubjectId && !item.disabled;
      }) ? preferredSubjectId : '')
      || ((selectable.find(function (item) { return !item.disabled; }) || {}).id)
      || (nextSubjects[0] && nextSubjects[0].id)
      || '';
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
      selectableSubjects: selectable,
      languages: nextLanguages,
      profile: nextProfile,
      applications: nextApplications,
      lifecycle: nextLifecycle,
      qualifications: nextQualifications,
      additionalMode: additionalMode,
      current: nextCurrent,
      topics: nextTopics,
      languagesError: loaded[1].status === 'rejected' || loaded[2].status === 'rejected'
        ? t('apply_languages_error')
        : '',
      topicsError: topicsError
    });
    if (loaded[0].status === 'rejected' || loaded[3].status === 'rejected')
      message(t('apply_initial_partial_error'), 'warning');
    else if (additionalMode)
      message(t('apply_another_subject_intro'), 'success');
    renderInitial(selectedSubjectId);
  })().catch(function (error) {
    document.getElementById('apply-skeleton').hidden = true;
    document.getElementById('apply-content').hidden = false;
    message(errorText(error, 'apply_initial_error'), 'error');
  });
})();
