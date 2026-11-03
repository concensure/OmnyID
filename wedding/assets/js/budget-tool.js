(function () {
  'use strict';
  var form = document.querySelector('[data-budget-tool]');
  if (!form) return;
  var model = window.OMNYID_WEDDING_BUDGET_MODEL_V1;
  var costs = window.OMNYID_WEDDING_BUDGET_COSTS_V1;
  var engine = window.OmnyWeddingBudgetEngine;
  var magnets = window.OmnyWeddingMagnets;
  var profileApi = window.OmnyWeddingMagnetProfile;
  var resultNode = document.querySelector('[data-budget-result]');
  var statusNode = form.querySelector('[data-budget-status]');
  var priorityInputs = Array.prototype.slice.call(form.querySelectorAll('[name="priority"]'));
  var lastEnvelope = null;

  function prefill(name, key, transform) {
    if (!profileApi) return;
    var fact = profileApi.load(localStorage).value.facts[key];
    var field = form.elements.namedItem(name);
    if (!fact || !field || typeof field.value !== 'string') return;
    var value = transform ? transform(fact.value) : fact.value;
    if (value === undefined || value === null || String(value).trim() === '') return;
    field.value = String(value);
    var note = document.createElement('span');
    note.className = 'magnet-prefill';
    note.textContent = 'From your ' + fact.source_label;
    field.closest('.magnet-field')?.appendChild(note);
  }

  prefill('total_budget_aud', 'budget_total_aud');
  prefill('guests', 'guest_count');
  prefill('state', 'state');
  prefill('location_type', 'area_type', function (value) { return value === 'capital' ? 'metro' : value; });
  prefill('setting', 'setting_preference');
  if (profileApi) {
    var priorityFact = profileApi.load(localStorage).value.facts.top_priorities;
    if (priorityFact && Array.isArray(priorityFact.value)) {
      priorityInputs.forEach(function (input) { input.checked = priorityFact.value.includes(input.value); });
    }
  }

  function message(text, kind) {
    statusNode.textContent = text;
    statusNode.dataset.kind = kind || '';
  }

  function money(amount) {
    return Number(amount).toLocaleString('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  }

  function selectedPriorities() {
    return priorityInputs.filter(function (input) { return input.checked; }).map(function (input) { return input.value; });
  }

  function inputValue(name) {
    var field = form.elements.namedItem(name);
    return field && typeof field.value === 'string' ? field.value : '';
  }

  function render(result) {
    var body = resultNode.querySelector('[data-allocation-body]');
    body.textContent = '';
    result.allocation.forEach(function (item) {
      var row = document.createElement('tr');
      [item.label, item.share + '%', money(item.amount), item.lowShare + '-' + item.highShare + '%'].forEach(function (value) {
        var cell = document.createElement('td');
        cell.textContent = value;
        row.appendChild(cell);
      });
      body.appendChild(row);
    });
    resultNode.querySelector('[data-budget-total]').textContent = money(result.totalBudget);
    resultNode.querySelector('[data-budget-per-guest]').textContent = money(result.perGuest) + ' per guest across the whole wedding';
    var list = resultNode.querySelector('[data-missing-costs]');
    list.textContent = '';
    result.missingCosts.forEach(function (item) {
      var entry = document.createElement('li');
      var strong = document.createElement('strong');
      strong.textContent = item.label + '. ';
      entry.appendChild(strong);
      entry.appendChild(document.createTextNode('Ask in writing: ' + item.ask));
      list.appendChild(entry);
    });
    resultNode.hidden = false;
    resultNode.focus();
  }

  priorityInputs.forEach(function (input) {
    input.addEventListener('change', function () {
      var selected = selectedPriorities();
      if (selected.length > 3) {
        input.checked = false;
        message('Choose up to three priorities so the allocation remains meaningful.', 'error');
      } else {
        message('', '');
      }
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var inputs = {
      totalBudget: inputValue('total_budget_aud'),
      guests: inputValue('guests'),
      state: inputValue('state'),
      locationType: inputValue('location_type'),
      setting: inputValue('setting'),
      drinks: inputValue('drinks'),
      day: inputValue('day'),
      priorities: selectedPriorities()
    };
    var result = engine.calculate(inputs, model, costs);
    if (!result.ok) {
      message(result.error, 'error');
      resultNode.hidden = true;
      return;
    }
    lastEnvelope = magnets.createEnvelope({
      schema: 'budget_reality_check',
      engine_version: result.engineVersion,
      data_version: 'budget-model.v' + result.modelVersion,
      inputs: inputs,
      result: result,
      origin: { page: location.pathname, referrer_class: document.referrer ? 'referred' : 'direct' }
    });
    var saved = magnets.save(localStorage, 'omnyid.wedding.magnet.budget.v1', lastEnvelope);
    if (profileApi) {
      var profileWrites = [
        ['guest_count', Number(inputs.guests)],
        ['budget_total_aud', Number(inputs.totalBudget)],
        ['budget_allocation', Object.fromEntries(result.allocation.map(function (item) { return [item.id, item.amount]; }))],
        ['top_priorities', inputs.priorities],
        ['planning_started_at', lastEnvelope.created_at.slice(0, 10)]
      ];
      if (inputs.state) profileWrites.push(['state', inputs.state]);
      if (inputs.locationType !== 'not_decided') profileWrites.push(['area_type', inputs.locationType === 'metro' ? 'capital' : inputs.locationType]);
      if (inputs.setting !== 'not_decided') profileWrites.push(['setting_preference', inputs.setting]);
      if (inputs.drinks !== 'not_decided') profileWrites.push(['vendor_preferences', 'Drinks plan: ' + inputs.drinks]);
      profileWrites.forEach(function (entry) {
        profileApi.writeAndSave(localStorage, 'BUD', entry[0], entry[1], { result_id: lastEnvelope.result_id, recorded_at: lastEnvelope.updated_at });
      });
    }
    message(saved.ok ? 'Your result is saved on this device. Nothing was sent anywhere.' : saved.message, saved.ok ? 'success' : 'error');
    render(result);
  });

  document.querySelector('[data-budget-print]').addEventListener('click', function () { window.print(); });
  document.querySelector('[data-budget-download]').addEventListener('click', function () {
    if (lastEnvelope) magnets.downloadJson('omnyid-wedding-budget-result.json', lastEnvelope);
  });
})();
