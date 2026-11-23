(function () {
  'use strict';

  var STORAGE_KEY = 'omnyid.public.privacy.v1';
  var VERSION = 1;
  var privacySignal = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';

  function readChoice() {
    try {
      var value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (value && value.version === VERSION && typeof value.analytics === 'boolean') return value;
    } catch (_) {}
    return null;
  }

  function writeChoice(analytics) {
    var value = { version: VERSION, analytics: privacySignal ? false : analytics === true, saved_at: new Date().toISOString() };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); } catch (_) {}
    return value;
  }

  function analyticsAllowed() {
    var choice = readChoice();
    return !privacySignal && choice !== null && choice.analytics === true;
  }

  function activateAnalytics() {
    if (!analyticsAllowed()) return;
    document.querySelectorAll('script[type="text/plain"][data-omnyid-consent="analytics"]').forEach(function (template) {
      if (template.dataset.omnyidActivated === 'true') return;
      template.dataset.omnyidActivated = 'true';
      var script = document.createElement('script');
      Array.from(template.attributes).forEach(function (attribute) {
        if (attribute.name === 'type' || attribute.name === 'data-omnyid-consent' || attribute.name === 'data-omnyid-activated') return;
        script.setAttribute(attribute.name, attribute.value);
      });
      if (template.textContent) script.textContent = template.textContent;
      script.dataset.omnyidAnalytics = 'active';
      template.after(script);
    });
  }

  function styles() {
    var style = document.createElement('style');
    style.textContent = [
      '.omnyid-privacy{position:fixed;z-index:2147483646;right:1rem;bottom:1rem;max-width:min(31rem,calc(100vw - 2rem));border:1px solid #d9d2c8;border-radius:1rem;background:#fffdf9;color:#2d211a;box-shadow:0 16px 48px rgba(39,28,21,.18);padding:1rem;font:400 14px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
      '.omnyid-privacy[hidden]{display:none}',
      '.omnyid-privacy h2{font:700 1.08rem/1.3 Georgia,serif;margin:0 0 .4rem}',
      '.omnyid-privacy p{margin:.35rem 0;color:#584a42}',
      '.omnyid-privacy a{color:#075f57;text-decoration:underline}',
      '.omnyid-privacy-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.8rem}',
      '.omnyid-privacy button{min-height:44px;border:1px solid #176e64;border-radius:.75rem;background:#fff;color:#075f57;padding:.55rem .85rem;font:700 14px/1.2 system-ui;cursor:pointer}',
      '.omnyid-privacy button[data-primary]{background:#176e64;color:#fff}',
      '.omnyid-privacy-choice{display:flex;gap:.65rem;align-items:flex-start;border:1px solid #e6dfd6;border-radius:.75rem;padding:.7rem;margin-top:.65rem}',
      '.omnyid-privacy-choice input{width:1.15rem;height:1.15rem;margin-top:.15rem;accent-color:#176e64}',
      '.omnyid-privacy-trigger{position:fixed;z-index:2147483645;right:.75rem;bottom:.75rem;min-height:38px;border:1px solid #d9d2c8;border-radius:999px;background:#fffdf9;color:#51443c;padding:.35rem .7rem;font:600 12px/1 system-ui;box-shadow:0 5px 20px rgba(39,28,21,.12);cursor:pointer}',
      '@media(max-width:600px){.omnyid-privacy{left:.65rem;right:.65rem;bottom:.65rem;max-width:none}.omnyid-privacy-trigger{right:.5rem;bottom:.5rem}}'
    ].join('');
    document.head.appendChild(style);
  }

  function buildPanel() {
    styles();
    var panel = document.createElement('section');
    panel.className = 'omnyid-privacy';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'omnyid-privacy-title');
    panel.innerHTML = '<h2 id="omnyid-privacy-title">Your privacy choices</h2>' +
      '<p>Essential storage keeps requested tools and security working. Optional analytics helps us improve public Wedding pages.</p>' +
      '<div class="omnyid-privacy-choice"><input type="checkbox" checked disabled aria-label="Essential storage is always active"><span><strong>Essential</strong><br>Security, sign-in hand-off and choices you ask this site to remember.</span></div>' +
      '<div class="omnyid-privacy-choice"><input id="omnyid-analytics-choice" type="checkbox"><label for="omnyid-analytics-choice"><strong>Analytics (optional)</strong><br>Content-free first-party events and Ahrefs page analytics. No plan, message, quote, budget, guest count or form text is sent.</label></div>' +
      '<p data-privacy-signal hidden><strong>Your browser privacy signal is on.</strong> Analytics will remain off.</p>' +
      '<p><a href="/wedding/privacy.html#measure">What is collected</a></p>' +
      '<div class="omnyid-privacy-actions"><button type="button" data-essential>Use essential only</button><button type="button" data-primary>Allow selected</button></div>';
    document.body.appendChild(panel);

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'omnyid-privacy-trigger';
    trigger.textContent = 'Privacy choices';
    trigger.hidden = true;
    document.body.appendChild(trigger);

    var checkbox = panel.querySelector('#omnyid-analytics-choice');
    var signalNote = panel.querySelector('[data-privacy-signal]');
    var existing = readChoice();
    checkbox.checked = analyticsAllowed();
    checkbox.disabled = privacySignal;
    signalNote.hidden = !privacySignal;
    panel.hidden = existing !== null;
    trigger.hidden = !panel.hidden;

    function close() {
      panel.hidden = true;
      trigger.hidden = false;
      trigger.focus();
    }
    function save(allowed) {
      var wasAllowed = analyticsAllowed();
      writeChoice(allowed);
      var isAllowed = analyticsAllowed();
      if (isAllowed) activateAnalytics();
      close();
      if (wasAllowed && !isAllowed) window.location.reload();
    }
    panel.querySelector('[data-essential]').addEventListener('click', function () { save(false); });
    panel.querySelector('[data-primary]').addEventListener('click', function () { save(checkbox.checked); });
    trigger.addEventListener('click', function () {
      checkbox.checked = analyticsAllowed();
      panel.hidden = false;
      trigger.hidden = true;
      panel.querySelector('[data-essential]').focus();
    });
  }

  window.OmnyPrivacy = {
    analyticsAllowed: analyticsAllowed,
    open: function () {
      var trigger = document.querySelector('.omnyid-privacy-trigger');
      if (trigger) trigger.click();
    }
  };
  activateAnalytics();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildPanel, { once: true });
  else buildPanel();
}());
