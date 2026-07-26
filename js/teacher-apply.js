(function () {
  var form = document.getElementById('application-form');
  var demoForm = document.getElementById('demo-form');
  var subject = document.getElementById('subject');
  var topic = document.getElementById('topic');
  var status = document.getElementById('apply-status');
  var current = null;
  var subjects = [];

  function message(text, kind) { status.textContent = text; status.dataset.kind = kind || ''; }
  function statusName(value) {
    return ['Draft', 'Submitted', 'Under review', 'Changes requested', 'Approved', 'Rejected', 'Withdrawn'][value] || 'Unknown';
  }
  async function loadTopics() {
    var items = await Tafseel.api.get('/topics?qualificationOnly=true&subjectId=' + encodeURIComponent(subject.value));
    topic.innerHTML = items.map(function (x) { return '<option value="' + x.id + '">' + x.name + '</option>'; }).join('');
  }
  async function loadApplications() {
    var items = await Tafseel.api.get('/teacher-applications/mine');
    current = items.find(function (x) { return x.status === 0 || x.status === 3; }) || items[0] || null;
    document.getElementById('applications').innerHTML = items.length
      ? items.map(function (x) { return '<button type="button" data-id="' + x.id + '"><strong>' + statusName(x.status) + '</strong><br><span class="tf-muted">' + x.id + '</span></button>'; }).join('')
      : '<p class="tf-muted">No application has been created yet.</p>';
    demoForm.hidden = !current || ![0, 3].includes(current.status);
  }
  async function reload() { await loadApplications(); }

  subject.addEventListener('change', function () { loadTopics().catch(function (e) { message(Tafseel.api.errorMessage(e), 'error'); }); });
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    var input = {
      subjectId: subject.value, qualificationTopicId: topic.value,
      city: document.getElementById('city').value,
      experienceYears: Number(document.getElementById('years').value),
      degree: document.getElementById('degree').value
    };
    try {
      if (current && [0, 3].includes(current.status))
        await Tafseel.api.put('/teacher-applications/' + current.id, input, { 'If-Match': current.version });
      else
        current = await Tafseel.api.post('/teacher-applications', input);
      await reload();
      message('Application saved.', 'success');
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  });
  demoForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!current) return;
    var data = new FormData();
    data.append('file', document.getElementById('demo').files[0]);
    data.append('durationSeconds', document.getElementById('duration').value);
    try {
      await Tafseel.api.upload('/teacher-applications/' + current.id + '/demo', data, { 'If-Match': current.version });
      await reload();
      message('Demo uploaded.', 'success');
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  });
  document.getElementById('submit-application').addEventListener('click', async function () {
    if (!current) return;
    try {
      await Tafseel.api.post('/teacher-applications/' + current.id + '/submit', null, { 'If-Match': current.version });
      await reload();
      message('Application submitted for quality review.', 'success');
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  });

  (async function () {
    var session = await Tafseel.api.ready();
    if (!session) return location.replace('Tafseel-Auth.dc.html');
    if (!session.roles.includes('Teacher')) return message('A Teacher account is required.', 'error');
    try {
      subjects = await Tafseel.api.get('/subjects');
      subject.innerHTML = subjects.map(function (x) { return '<option value="' + x.id + '">' + x.name + '</option>'; }).join('');
      await loadTopics();
      await reload();
    } catch (error) { message(Tafseel.api.errorMessage(error), 'error'); }
  })();
})();
