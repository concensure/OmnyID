(function (global) {
  'use strict';

  var SCHEMAS = [
    'budget_reality_check',
    'venue_quote_decoder',
    'shot_list_builder',
    'style_palette_builder',
    'invitation_wording_generator',
    'wedding_countdown'
  ];
  var FROM_VALUES = ['budget', 'quotes', 'shots', 'palette', 'invitation', 'countdown'];

  function text(value, max) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }

  function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  }

  function resultId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'magnet-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function createEnvelope(input, now) {
    var createdAt = now || new Date().toISOString();
    if (!SCHEMAS.includes(input.schema)) throw new Error('Unknown wedding tool schema.');
    return {
      schema: input.schema,
      version: 1,
      result_id: text(input.result_id, 80) || resultId(),
      created_at: text(input.created_at, 40) || createdAt,
      updated_at: createdAt,
      engine_version: text(input.engine_version, 24),
      data_version: text(input.data_version, 40),
      inputs: record(input.inputs) || {},
      result: record(input.result) || {},
      origin: {
        page: text(record(input.origin) && input.origin.page, 160),
        referrer_class: text(record(input.origin) && input.origin.referrer_class, 40) || undefined
      }
    };
  }

  function validEnvelope(value, expectedSchema) {
    var item = record(value);
    if (!item || item.version !== 1 || !SCHEMAS.includes(item.schema)) return false;
    if (expectedSchema && item.schema !== expectedSchema) return false;
    return Boolean(
      text(item.result_id, 80) &&
      text(item.created_at, 40) &&
      text(item.updated_at, 40) &&
      record(item.inputs) &&
      record(item.result) &&
      record(item.origin)
    );
  }

  function save(storage, key, envelope) {
    if (!validEnvelope(envelope)) return { ok: false, message: 'This result could not be saved because its format is invalid.' };
    try {
      storage.setItem(key, JSON.stringify(envelope));
      return { ok: true, message: '' };
    } catch (error) {
      return { ok: false, message: 'Your result is ready, but this browser blocked saving it on this device.' };
    }
  }

  function load(storage, key, expectedSchema) {
    try {
      var raw = storage.getItem(key);
      if (!raw) return { ok: true, value: null, message: '' };
      var parsed = JSON.parse(raw);
      return validEnvelope(parsed, expectedSchema)
        ? { ok: true, value: parsed, message: '' }
        : { ok: false, value: null, message: 'The saved result is from an unsupported version.' };
    } catch (error) {
      return { ok: false, value: null, message: 'This browser could not read the result saved on this device.' };
    }
  }

  function remove(storage, key) {
    try {
      storage.removeItem(key);
      return { ok: true, message: '' };
    } catch (error) {
      return { ok: false, message: 'This browser could not delete the saved result.' };
    }
  }

  function continueUrl(from, authenticated) {
    var safeFrom = FROM_VALUES.includes(from) ? from : '';
    return '/workspace/?' + (authenticated ? '' : 'auth=register&') + 'source=wedding' + (safeFrom ? '&from=' + safeFrom : '');
  }

  function personalizeContinueLinks(documentRef, fetchRef) {
    var documentObject = documentRef || global.document;
    var request = fetchRef || global.fetch;
    if (!documentObject || typeof documentObject.querySelectorAll !== 'function' || typeof request !== 'function') return Promise.resolve(false);
    var links = Array.from(documentObject.querySelectorAll('[data-magnet-continue]'));
    if (!links.length) return Promise.resolve(false);
    return request('/auth/session', { credentials: 'same-origin' }).then(function (response) {
      if (!response || !response.ok) return false;
      links.forEach(function (link) {
        var from = link.getAttribute('data-magnet-from') || '';
        link.href = continueUrl(from, true);
        link.textContent = 'Add to your plan';
        link.setAttribute('data-session-authenticated', 'true');
      });
      return true;
    }).catch(function () { return false; });
  }

  function downloadJson(filename, value, documentRef) {
    var documentObject = documentRef || global.document;
    var blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var link = documentObject.createElement('a');
    link.href = url;
    link.download = text(filename, 100) || 'wedding-result.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  global.OmnyWeddingMagnets = Object.freeze({
    schemas: Object.freeze(SCHEMAS.slice()),
    createEnvelope: createEnvelope,
    validEnvelope: validEnvelope,
    save: save,
    load: load,
    remove: remove,
    continueUrl: continueUrl,
    personalizeContinueLinks: personalizeContinueLinks,
    downloadJson: downloadJson
  });
  personalizeContinueLinks(global.document, global.fetch);
})(window);
