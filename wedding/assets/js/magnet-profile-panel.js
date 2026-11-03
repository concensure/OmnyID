(function () {
  'use strict';
  var host = document.querySelector('[data-magnet-profile-panel]');
  var api = window.OmnyWeddingMagnetProfile;
  if (!host || !api) return;

  function labelFor(key) { return key.replace(/_/g, ' ').replace(/^./, function (value) { return value.toUpperCase(); }); }
  function shown(value) { return typeof value === 'string' || typeof value === 'number' ? String(value) : JSON.stringify(value); }
  function parse(value, original) {
    if (typeof original === 'number') return Number(value);
    if (original && typeof original === 'object') return JSON.parse(value);
    return value;
  }
  function status(text, kind) {
    var node = host.querySelector('[data-profile-status]');
    if (!node) return;
    node.textContent = text;
    node.dataset.kind = kind || '';
  }
  function render() {
    var profile = api.load(localStorage).value;
    var facts = Object.values(profile.facts).sort(function (left, right) { return left.key.localeCompare(right.key); });
    host.textContent = '';
    var heading = document.createElement('h3'); heading.textContent = 'What we remember on this device'; host.appendChild(heading);
    var intro = document.createElement('p'); intro.className = 'magnet-help'; intro.textContent = 'These details have not left this browser. Change or remove any one before deciding whether to bring them into a workspace.'; host.appendChild(intro);
    var statusNode = document.createElement('p'); statusNode.className = 'magnet-status'; statusNode.dataset.profileStatus = ''; statusNode.setAttribute('role', 'status'); host.appendChild(statusNode);
    if (!facts.length) {
      var empty = document.createElement('p'); empty.textContent = 'Nothing is remembered yet.'; host.appendChild(empty); return;
    }
    var list = document.createElement('div'); list.className = 'magnet-profile-list';
    facts.forEach(function (fact) {
      var row = document.createElement('details'); row.className = 'magnet-profile-row';
      var summary = document.createElement('summary'); summary.textContent = labelFor(fact.key) + ': ' + shown(fact.value); row.appendChild(summary);
      var source = document.createElement('p'); source.className = 'magnet-help'; source.textContent = 'From your ' + fact.source_label + ' · ' + new Date(fact.recorded_at).toLocaleDateString('en-AU'); row.appendChild(source);
      var editor = document.createElement(typeof fact.value === 'object' ? 'textarea' : 'input'); editor.value = shown(fact.value); editor.setAttribute('aria-label', 'Change ' + labelFor(fact.key)); row.appendChild(editor);
      var actions = document.createElement('div'); actions.className = 'magnet-actions';
      var save = document.createElement('button'); save.type = 'button'; save.className = 'magnet-link-button'; save.textContent = 'Save change';
      save.addEventListener('click', function () { try { var result = api.editFact(localStorage, fact.key, parse(editor.value, fact.value)); status(result.message || 'Change saved on this device.', result.ok ? 'success' : 'error'); if (result.ok) render(); } catch (error) { status('Use valid text or JSON for this detail.', 'error'); } });
      var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'magnet-link-button'; remove.textContent = 'Remove';
      remove.addEventListener('click', function () { if (!window.confirm('Remove this remembered detail from this device?')) return; api.deleteFact(localStorage, fact.key); render(); });
      actions.appendChild(save); actions.appendChild(remove); row.appendChild(actions); list.appendChild(row);
    });
    host.appendChild(list);
    var footer = document.createElement('div'); footer.className = 'magnet-actions';
    var download = document.createElement('button'); download.type = 'button'; download.className = 'magnet-link-button'; download.textContent = 'Download profile JSON';
    download.addEventListener('click', function () { var blob = new Blob([api.exportJson(api.load(localStorage).value)], { type: 'application/json' }); var url = URL.createObjectURL(blob); var link = document.createElement('a'); link.href = url; link.download = 'omnyid-wedding-profile.json'; link.click(); URL.revokeObjectURL(url); });
    var clear = document.createElement('button'); clear.type = 'button'; clear.className = 'magnet-link-button'; clear.textContent = 'Delete all remembered details';
    clear.addEventListener('click', function () { if (!window.confirm('Delete every wedding detail remembered by these tools on this device?')) return; api.deleteAll(localStorage); render(); });
    footer.appendChild(download); footer.appendChild(clear); host.appendChild(footer);
  }
  render();
})();
