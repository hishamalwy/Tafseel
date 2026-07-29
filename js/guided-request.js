/* Limited Guided Request helpers — pure functions for composition, drafts, prompts and validation. */
(function (global) {
  'use strict';

  var DRAFT_VERSION = 1;
  var DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var DRAFT_PREFIX = 'tafseel:guided-request:v1:';
  var MAX_FILES = 5;
  var MAX_BYTES = 50 * 1024 * 1024;
  var ALLOWED_EXT = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip' };

  var EXPLANATION_STYLES = [
    'step_by_step',
    'short_direct',
    'detailed',
    'visual',
    'exam_focused',
    'practice_focused'
  ];

  /** Fixed prompt keys per canonical request-based service code. */
  var SERVICE_PROMPTS = {
    recorded_explanation: [
      { key: 'concept', required: true },
      { key: 'stuck', required: true },
      { key: 'scope', required: false },
      { key: 'file_use', required: false }
    ],
    assignment_guidance: [
      { key: 'assignment', required: true },
      { key: 'attempted', required: true },
      { key: 'failed', required: false },
      { key: 'help_type', required: true }
    ],
    exam_revision: [
      { key: 'exam_date', required: true },
      { key: 'topics', required: true },
      { key: 'weakest', required: false },
      { key: 'focus', required: false }
    ]
  };

  function normalizeCode(code) {
    return String(code || '').trim().toLowerCase();
  }

  function promptsForService(code) {
    return SERVICE_PROMPTS[normalizeCode(code)] || [
      { key: 'generic_detail', required: false }
    ];
  }

  function isExplanationStyle(value) {
    return EXPLANATION_STYLES.indexOf(String(value || '')) >= 0;
  }

  function isSchedulingService(service) {
    if (!service) return false;
    if (service.requiresScheduling || service.canBook && !service.canRequest) return true;
    return normalizeCode(service.serviceCatalogCode) === 'live_session';
  }

  function requestableServices(services) {
    return (services || []).filter(function (s) { return s && s.canRequest && !isSchedulingService(s); });
  }

  function subjectNameForService(profile, service) {
    if (!service) return '';
    var subjects = (profile && profile.subjects) || [];
    var match = subjects.find(function (s) { return String(s.id) === String(service.subjectId); });
    return (match && (match.name || match.nameEn || match.nameAr)) || '';
  }

  function composeDescription(input, labels) {
    labels = labels || {};
    var sections = [];
    var goal = String(input.goal || '').trim();
    if (goal) sections.push((labels.goal || 'Goal') + ':\n' + goal);

    var detailLines = [];
    var prompts = input.prompts || {};
    var order = input.promptOrder || Object.keys(prompts);
    order.forEach(function (key) {
      var value = String(prompts[key] || '').trim();
      if (!value) return;
      var label = (labels.prompt && labels.prompt[key]) || key;
      detailLines.push('- ' + label + ': ' + value);
    });
    if (detailLines.length)
      sections.push((labels.serviceDetails || 'Service details') + ':\n' + detailLines.join('\n'));

    if (input.topicLabel && String(input.topicLabel).trim())
      sections.push((labels.topic || 'Topic') + ':\n' + String(input.topicLabel).trim());

    if (input.explanationStyle && isExplanationStyle(input.explanationStyle)) {
      var styleLabel = (labels.style && labels.style[input.explanationStyle]) || input.explanationStyle;
      sections.push((labels.explanationPreference || 'Explanation preference') + ':\n' + styleLabel);
    }

    var notes = String(input.constraints || '').trim();
    if (notes) sections.push((labels.additionalNotes || 'Additional notes') + ':\n' + notes);

    return sections.join('\n\n').trim();
  }

  function draftKey(studentId, teacherId) {
    return DRAFT_PREFIX + String(studentId || 'anon') + ':' + String(teacherId || '');
  }

  function readDraft(studentId, teacherId) {
    try {
      var raw = global.localStorage.getItem(draftKey(studentId, teacherId));
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || data.v !== DRAFT_VERSION) return null;
      if (data.savedAt && (Date.now() - Number(data.savedAt)) > DRAFT_TTL_MS) {
        global.localStorage.removeItem(draftKey(studentId, teacherId));
        return null;
      }
      return data;
    } catch (_) {
      return null;
    }
  }

  function writeDraft(studentId, teacherId, payload) {
    var safe = {
      v: DRAFT_VERSION,
      savedAt: Date.now(),
      teacherId: String(teacherId || ''),
      serviceId: payload.serviceId ? String(payload.serviceId) : '',
      step: Number(payload.step) || 1,
      title: String(payload.title || '').slice(0, 200),
      goal: String(payload.goal || '').slice(0, 5000),
      constraints: String(payload.constraints || '').slice(0, 2000),
      topicLabel: String(payload.topicLabel || '').slice(0, 200),
      explanationStyle: isExplanationStyle(payload.explanationStyle) ? payload.explanationStyle : '',
      prompts: payload.prompts && typeof payload.prompts === 'object' ? payload.prompts : {},
      deliveryDate: String(payload.deliveryDate || ''),
      flexibleBudget: !!payload.flexibleBudget,
      budget: Number(payload.budget) || 0,
      fileNames: Array.isArray(payload.fileNames)
        ? payload.fileNames.map(function (n) { return String(n).slice(0, 255); }).slice(0, MAX_FILES)
        : [],
      agreed: !!payload.agreed
    };
    // Never persist tokens, file bytes, or errors.
    global.localStorage.setItem(draftKey(studentId, teacherId), JSON.stringify(safe));
    return safe;
  }

  function clearDraft(studentId, teacherId) {
    try { global.localStorage.removeItem(draftKey(studentId, teacherId)); } catch (_) { /* ignore */ }
  }

  function validateFile(file) {
    if (!file || !file.name) return { ok: false, code: 'missing' };
    var ext = String(file.name.split('.').pop() || '').toLowerCase();
    var expected = ALLOWED_EXT[ext];
    if (!expected) return { ok: false, code: 'type' };
    var size = Number(file.size) || 0;
    if (size <= 0 || size > MAX_BYTES) return { ok: false, code: 'size' };
    return { ok: true, ext: ext, expectedType: expected };
  }

  function checklist(state) {
    var items = [];
    function add(id, kind, done) {
      items.push({ id: id, kind: kind, done: !!done });
    }
    add('teacher', 'required', !!state.teacherId);
    add('service', 'required', !!state.serviceId);
    add('subject', 'recommended', !!state.subjectLabel);
    add('goal', 'required', !!(state.goal && String(state.goal).trim()));
    add('title', 'required', !!(state.title && String(state.title).trim()));
    var prompts = state.promptDefs || [];
    var answers = state.prompts || {};
    var requiredOk = prompts.every(function (p) {
      return !p.required || !!(answers[p.key] && String(answers[p.key]).trim());
    });
    add('service_prompts', 'required', requiredOk);
    add('style', 'recommended', isExplanationStyle(state.explanationStyle));
    add('deadline', 'required', !!state.deliveryDate);
    add('budget', 'required', !!state.flexibleBudget || (Number(state.budget) > 0));
    add('files', 'recommended', (state.fileCount || 0) > 0);
    return items;
  }

  function requiredChecklistComplete(items) {
    return (items || []).every(function (i) { return i.kind !== 'required' || i.done; });
  }

  global.TafseelGuidedRequest = {
    DRAFT_VERSION: DRAFT_VERSION,
    MAX_FILES: MAX_FILES,
    MAX_BYTES: MAX_BYTES,
    EXPLANATION_STYLES: EXPLANATION_STYLES,
    SERVICE_PROMPTS: SERVICE_PROMPTS,
    promptsForService: promptsForService,
    isExplanationStyle: isExplanationStyle,
    isSchedulingService: isSchedulingService,
    requestableServices: requestableServices,
    subjectNameForService: subjectNameForService,
    composeDescription: composeDescription,
    draftKey: draftKey,
    readDraft: readDraft,
    writeDraft: writeDraft,
    clearDraft: clearDraft,
    validateFile: validateFile,
    checklist: checklist,
    requiredChecklistComplete: requiredChecklistComplete,
    normalizeCode: normalizeCode
  };
})(typeof window !== 'undefined' ? window : globalThis);
