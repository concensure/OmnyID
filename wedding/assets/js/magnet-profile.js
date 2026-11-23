(function (global) {
  'use strict';

  var STORAGE_KEY = 'omnyid.wedding.magnetProfile.v1';
  var TOOL_LABELS = {
    BUD: 'Budget Reality Check', QDEC: 'Venue Quote Decoder', SHOT: 'Shot List Builder',
    PAL: 'Style and Palette Builder', INV: 'Invitation Wording Generator', CDN: 'Wedding Countdown',
    USER: 'Manual change'
  };

  function registry() {
    var value = global.OmnyWeddingMagnetProfileFields;
    return value && value.version === 1 && Array.isArray(value.fields) ? value : { version: 1, fields: [] };
  }

  function field(key) {
    return registry().fields.find(function (item) { return item.key === key; }) || null;
  }

  function emptyProfile(now) {
    return { version: 1, updated_at: now || new Date().toISOString(), facts: {} };
  }

  function cleanText(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + 'T00:00:00Z'));
  }

  function validateValue(definition, value) {
    var limits = definition.validation || {};
    if (definition.type === 'string') {
      if (typeof value !== 'string' || !value.trim()) return false;
      if (limits.max_length && value.trim().length > limits.max_length) return false;
      return !limits.enum || limits.enum.includes(value);
    }
    if (definition.type === 'date') return typeof value === 'string' && validDate(value);
    if (definition.type === 'integer') {
      return Number.isInteger(value) && (limits.min === undefined || value >= limits.min) && (limits.max === undefined || value <= limits.max);
    }
    if (definition.type === 'object') {
      return Boolean(value && typeof value === 'object' && !Array.isArray(value)) && (!limits.max_keys || Object.keys(value).length <= limits.max_keys);
    }
    if (definition.type === 'string_array') {
      return Array.isArray(value) && (!limits.min_items || value.length >= limits.min_items) && (!limits.max_items || value.length <= limits.max_items) && value.every(function (item) {
        return typeof item === 'string' && item.trim() && (!limits.item_max_length || item.trim().length <= limits.item_max_length);
      });
    }
    if (definition.type === 'object_array') {
      return Array.isArray(value) && (!limits.max_items || value.length <= limits.max_items) && value.every(function (item) { return item && typeof item === 'object' && !Array.isArray(item); });
    }
    return false;
  }

  function validFact(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    var definition = field(value.key);
    return Boolean(definition && validateValue(definition, value.value) && TOOL_LABELS[value.source_tool] && cleanText(value.result_id, 80) && cleanText(value.recorded_at, 40));
  }

  function normalizeProfile(value, now) {
    var source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    var facts = {};
    if (source.facts && typeof source.facts === 'object' && !Array.isArray(source.facts)) {
      Object.keys(source.facts).forEach(function (key) {
        var item = source.facts[key];
        if (!validFact(item) || item.key !== key) return;
        item.history = Array.isArray(item.history) ? item.history.filter(validFact).slice(-3) : [];
        facts[key] = item;
      });
    }
    return { version: 1, updated_at: cleanText(source.updated_at, 40) || now || new Date().toISOString(), facts: facts };
  }

  function load(storage) {
    try {
      var raw = storage.getItem(STORAGE_KEY);
      return { ok: true, value: normalizeProfile(raw ? JSON.parse(raw) : null), message: '' };
    } catch (error) {
      return { ok: false, value: emptyProfile(), message: 'This browser could not read the wedding details remembered on this device.' };
    }
  }

  function save(storage, profile) {
    var normalized = normalizeProfile(profile);
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return { ok: true, value: normalized, message: '' };
    } catch (error) {
      return { ok: false, value: normalized, message: 'Your result is ready, but this browser blocked remembering it on this device.' };
    }
  }

  function sourceLabel(tool) {
    return TOOL_LABELS[tool] || 'Wedding tool';
  }

  function sameValue(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function mergedSet(left, right) {
    return Array.from(new Set([].concat(left || [], right || []).map(function (item) { return String(item).trim(); }).filter(Boolean)));
  }

  function writeFact(profile, tool, key, value, metadata) {
    var definition = field(key);
    if (!definition) return { ok: false, profile: normalizeProfile(profile), conflict: false, message: 'Unknown profile field.' };
    if (!definition.writers.includes(tool)) return { ok: false, profile: normalizeProfile(profile), conflict: false, message: sourceLabel(tool) + ' is not allowed to write ' + key + '.' };
    if (!validateValue(definition, value)) return { ok: false, profile: normalizeProfile(profile), conflict: false, message: 'That value is not valid for ' + key + '.' };
    var next = normalizeProfile(profile);
    var current = next.facts[key] || null;
    var authority = metadata && ['stated', 'derived', 'candidate'].includes(metadata.authority) ? metadata.authority : 'stated';
    var recordedAt = cleanText(metadata && metadata.recorded_at, 40) || new Date().toISOString();
    var incoming = {
      key: key, value: value, source_tool: tool, source_label: sourceLabel(tool),
      result_id: cleanText(metadata && metadata.result_id, 80), recorded_at: recordedAt,
      authority: authority, tier: definition.tier, history: []
    };
    if (!incoming.result_id) return { ok: false, profile: next, conflict: false, message: 'A result id is required for profile provenance.' };
    if (current && current.authority === 'stated' && authority !== 'stated') {
      return { ok: true, profile: next, conflict: !sameValue(current.value, value), message: 'Kept the stated value and recorded the lower-authority suggestion for review.' };
    }
    if (current && /set union/.test(definition.conflict_rule) && Array.isArray(current.value) && Array.isArray(value)) incoming.value = mergedSet(current.value, value);
    incoming.history = current ? [current].concat(current.history || []).slice(0, 3).map(function (item) {
      return Object.assign({}, item, { history: [] });
    }) : [];
    next.facts[key] = incoming;
    next.updated_at = recordedAt;
    return { ok: true, profile: next, conflict: Boolean(current && !sameValue(current.value, incoming.value)), message: '' };
  }

  function writeAndSave(storage, tool, key, value, metadata) {
    var loaded = load(storage);
    var result = writeFact(loaded.value, tool, key, value, metadata || {});
    if (!result.ok) return result;
    var saved = save(storage, result.profile);
    return Object.assign({}, result, { ok: saved.ok, profile: saved.value, message: saved.message || result.message });
  }

  function editFact(storage, key, value) {
    var definition = field(key);
    var loaded = load(storage);
    var current = loaded.value.facts[key];
    if (!definition || !current) return { ok: false, value: loaded.value, message: 'That remembered detail no longer exists.' };
    if (!validateValue(definition, value)) return { ok: false, value: loaded.value, message: 'That change does not match the expected format.' };
    var recordedAt = new Date().toISOString();
    var replacement = {
      key: key, value: value, source_tool: 'USER', source_label: 'Manual change',
      result_id: 'profile-edit-' + Date.now().toString(36), recorded_at: recordedAt,
      authority: 'stated', tier: definition.tier,
      history: [current].concat(current.history || []).slice(0, 3).map(function (item) { return Object.assign({}, item, { history: [] }); })
    };
    loaded.value.facts[key] = replacement;
    loaded.value.updated_at = recordedAt;
    return save(storage, loaded.value);
  }

  function deleteFact(storage, key) {
    var loaded = load(storage);
    delete loaded.value.facts[key];
    loaded.value.updated_at = new Date().toISOString();
    return save(storage, loaded.value);
  }

  function deleteAll(storage) {
    try {
      storage.removeItem(STORAGE_KEY);
      return { ok: true, value: emptyProfile(), message: '' };
    } catch (error) {
      return { ok: false, value: emptyProfile(), message: 'This browser could not clear the remembered wedding details.' };
    }
  }

  function exportJson(profile) {
    return JSON.stringify(normalizeProfile(profile), null, 2);
  }

  global.OmnyWeddingMagnetProfile = Object.freeze({
    storageKey: STORAGE_KEY, emptyProfile: emptyProfile, load: load, save: save,
    writeFact: writeFact, writeAndSave: writeAndSave, deleteFact: deleteFact,
    editFact: editFact, deleteAll: deleteAll, exportJson: exportJson, sourceLabel: sourceLabel,
    fields: function () { return registry().fields.slice(); }
  });
})(window);
