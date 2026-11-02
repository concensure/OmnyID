(function () {
  'use strict';
  var form = document.querySelector('[data-budget-tool]');
  if (!form) return;
  var model = window.OMNYID_WEDDING_BUDGET_MODEL_V1;
  var costs = window.OMNYID_WEDDING_BUDGET_COSTS_V1;
  var engine = window.OmnyWeddingBudgetEngine;
  var magnets = window.OmnyWeddingMagnets;
  var resultNode = document.querySelector('[data-budget-result]');
  var statusNode = form.querySelector('[data-budget-status]');
  var priorityInputs = Array.prototype.slice.call(form.querySelectorAll('[name="priority"]'));
  var lastEnvelope = null;

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
    message(saved.ok ? 'Your result is saved on this device. Nothing was sent anywhere.' : saved.message, saved.ok ? 'success' : 'error');
    render(result);
  });

  document.querySelector('[data-budget-print]').addEventListener('click', function () { window.print(); });
  document.querySelector('[data-budget-download]').addEventListener('click', function () {
    if (lastEnvelope) magnets.downloadJson('omnyid-wedding-budget-result.json', lastEnvelope);
  });
})();
