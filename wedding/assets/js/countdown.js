(function () {
  'use strict';
  var form = document.querySelector('[data-countdown-form]');
  if (!form) return;
  var engine = window.OmnyWeddingCountdown;
  var profileApi = window.OmnyWeddingMagnetProfile;
  var magnets = window.OmnyWeddingMagnets;
  var resultNode = document.querySelector('[data-countdown-result]');
  var statusNode = form.querySelector('[data-countdown-status]');
  var dateInput = form.elements.namedItem('wedding_date');
  var catalogue = null;
  var plan = null;
  var doneIds = [];
  var resultEnvelope = null;
  var storageKey = 'omnyid.wedding.countdown.v1';

  function message(text, kind) { statusNode.textContent = text; statusNode.dataset.kind = kind || ''; }
  function formatDate(value) { return new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z')); }
  function download(filename, body, type) {
    var link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([body], { type: type }));
    link.download = filename; link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); }, 0);
  }
  function saveLocal() {
    try { localStorage.setItem(storageKey, JSON.stringify({ weddingDate: dateInput.value, doneIds: doneIds })); return true; } catch (_) { return false; }
  }
  function loadLocal() {
    try { var value = JSON.parse(localStorage.getItem(storageKey) || '{}'); return { weddingDate: value.weddingDate || '', doneIds: Array.isArray(value.doneIds) ? value.doneIds : [] }; } catch (_) { return { weddingDate: '', doneIds: [] }; }
  }

  function createTask(task, compact) {
    var label = document.createElement('label'); label.className = compact ? 'countdown-task countdown-task-compact' : 'countdown-task';
    var input = document.createElement('input'); input.type = 'checkbox'; input.checked = task.completed; input.dataset.taskId = task.id;
    var copy = document.createElement('span');
    var strong = document.createElement('strong'); strong.textContent = task.title; copy.appendChild(strong);
    var detail = document.createElement('small');
    detail.textContent = (task.status === 'catch_up' ? 'Catch up now · ' : '') + formatDate(task.targetDate) + ' · ' + task.whyItMatters;
    copy.appendChild(detail); label.append(input, copy); return label;
  }

  function render() {
    plan = engine.buildPlan(catalogue, { weddingDate: dateInput.value, doneIds: doneIds });
    if (!plan.ok) { message(plan.error, 'error'); resultNode.hidden = true; return; }
    resultNode.querySelector('[data-days-to-go]').textContent = String(plan.daysToGo);
    resultNode.querySelector('[data-progress]').textContent = plan.completedCount + ' of ' + plan.totalCount + ' tasks complete';
    resultNode.querySelector('[data-current-stage]').textContent = plan.currentStage ? plan.currentStage.label : 'Wedding & after';
    var compressed = resultNode.querySelector('[data-compressed-note]');
    compressed.hidden = !plan.compressedPlan; compressed.textContent = plan.catchUpTasks.length
      ? 'Your timeline is shorter than a year, so ' + plan.catchUpTasks.length + ' earlier planning items are grouped into Catch up now. Nothing is silently removed.'
      : 'Your timeline is shorter than a year. The checklist keeps every relevant item and prioritises the next useful action.';
    var weekend = resultNode.querySelector('[data-weekend-note]'); weekend.hidden = !plan.weekendDate;
    var noim = resultNode.querySelector('[data-noim]');
    noim.textContent = plan.noim ? 'Planning target: ' + formatDate(plan.noim.originalTargetDate) + '. Legal window: 18 months to at least 1 month before the ceremony. Give the form to the authorised celebrant; confirm your circumstances with them.' : '';
    var next = resultNode.querySelector('[data-next-tasks]'); next.textContent = ''; plan.nextTasks.forEach(function (task) { next.appendChild(createTask(task, true)); });
    var stages = resultNode.querySelector('[data-stage-tasks]'); stages.textContent = '';
    plan.stages.forEach(function (stage) {
      var details = document.createElement('details'); details.className = 'countdown-stage'; details.open = plan.currentStage && stage.id === plan.currentStage.id;
      var summary = document.createElement('summary'); summary.textContent = stage.label + ' · ' + stage.completedCount + '/' + stage.taskCount;
      var gate = document.createElement('p'); gate.className = 'magnet-help'; gate.textContent = 'Stage gate: ' + stage.gateLabel;
      var tasks = plan.tasks.filter(function (task) { return task.stageId === stage.id; });
      details.append(summary, gate); tasks.forEach(function (task) { details.appendChild(createTask(task, false)); }); stages.appendChild(details);
    });
    resultEnvelope = magnets.createEnvelope({
      schema: 'wedding_countdown', engine_version: 'countdown-engine.v1', data_version: catalogue.schema,
      inputs: { wedding_date: dateInput.value }, result: { completed_catalogue_tasks: doneIds, task_count: plan.totalCount },
      origin: { page: location.pathname, referrer_class: document.referrer ? 'referred' : 'direct' }
    });
    if (profileApi) {
      profileApi.writeAndSave(localStorage, 'CDN', 'wedding_date', dateInput.value, { result_id: resultEnvelope.result_id, recorded_at: resultEnvelope.updated_at });
      profileApi.writeAndSave(localStorage, 'CDN', 'completed_catalogue_tasks', doneIds, { result_id: resultEnvelope.result_id, recorded_at: resultEnvelope.updated_at });
      profileApi.writeAndSave(localStorage, 'CDN', 'planning_started_at', resultEnvelope.created_at.slice(0, 10), { result_id: resultEnvelope.result_id, recorded_at: resultEnvelope.updated_at });
    }
    saveLocal(); resultNode.hidden = false; message('Checklist updated on this device. Nothing was sent anywhere.', 'success');
  }

  document.addEventListener('change', function (event) {
    var input = event.target.closest && event.target.closest('[data-task-id]'); if (!input) return;
    doneIds = input.checked ? Array.from(new Set(doneIds.concat(input.dataset.taskId))) : doneIds.filter(function (id) { return id !== input.dataset.taskId; });
    render();
  });
  form.addEventListener('submit', function (event) { event.preventDefault(); render(); resultNode.focus(); });
  document.querySelector('[data-countdown-print]').addEventListener('click', function () { window.print(); });
  document.querySelector('[data-countdown-ics]').addEventListener('click', function () { if (plan) download('omnyid-wedding-countdown.ics', engine.buildIcs(plan), 'text/calendar;charset=utf-8'); });
  document.querySelector('[data-countdown-download]').addEventListener('click', function () { if (resultEnvelope) magnets.downloadJson('omnyid-wedding-countdown.json', resultEnvelope); });
  document.querySelector('[data-countdown-share]').addEventListener('click', function () {
    var url = location.origin + location.pathname + engine.buildShareHash(dateInput.value, doneIds);
    navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(url).then(function () { message('Private checklist link copied. It contains only the date and completed task IDs.', 'success'); }) : message('Copy the address from your browser to share this checklist.', '');
  });

  Promise.all([fetch('assets/data/wedding-catalogue.v1.json', { credentials: 'same-origin' }).then(function (response) { if (!response.ok) throw new Error('catalogue'); return response.json(); })]).then(function (values) {
    catalogue = values[0];
    if (!catalogue.publicationReady) throw new Error('catalogue not ready');
    var shared = engine.parseShareHash(location.hash); var saved = loadLocal();
    dateInput.value = shared.weddingDate || saved.weddingDate;
    doneIds = shared.doneIds.length ? shared.doneIds : saved.doneIds;
    if (!dateInput.value && profileApi) { var fact = profileApi.load(localStorage).value.facts.wedding_date; if (fact) dateInput.value = String(fact.value || ''); }
    if (dateInput.value) render(); else message('Choose your wedding date to build the checklist.', '');
  }).catch(function () { message('The checklist could not load safely. Please refresh and try again.', 'error'); form.querySelector('button[type="submit"]').disabled = true; });
})();
