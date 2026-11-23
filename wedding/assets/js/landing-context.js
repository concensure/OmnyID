(function () {
  'use strict';

  var config = window.OmnyWeddingLanding;
  if (!config) return;

  var storageKey = 'omnyid.wedding.landingContext.v1';
  var params = new URLSearchParams(window.location.search);
  var intent = params.get('intent');
  var fromIntent = Object.prototype.hasOwnProperty.call(config.intents, intent)
    ? config.intents[intent]
    : null;
  var stored = null;
  try {
    stored = window.sessionStorage.getItem(storageKey);
  } catch (_error) {
    stored = null;
  }
  var current = config.contexts[stored]
    ? stored
    : config.contexts[fromIntent]
      ? fromIntent
      : config.defaultContext;

  function propagateCampaignParameters() {
    var allowed = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    var safe = new URLSearchParams();
    allowed.forEach(function (name) {
      var value = params.get(name);
      if (value && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value)) safe.set(name, value);
    });
    if (Object.prototype.hasOwnProperty.call(config.intents, intent) || intent === 'quiz') {
      safe.set('intent', intent);
    }
    document.querySelectorAll('a[href*="workspace/?auth="]').forEach(function (link) {
      var destination = new URL(link.getAttribute('href'), window.location.href);
      safe.forEach(function (value, name) { destination.searchParams.set(name, value); });
      link.setAttribute('href', destination.pathname + destination.search + destination.hash);
    });
  }

  function activatePreview(tabId) {
    var tab = document.querySelector('.tab-row [data-tab="' + tabId + '"]');
    if (tab) tab.click();
  }

  function applyContext(id, explicit) {
    var context = config.contexts[id] || config.contexts[config.defaultContext];
    var headline = document.querySelector('[data-context-headline]');
    var description = document.querySelector('[data-context-description]');
    var benefit = document.querySelector('[data-context-benefit]');
    var cta = document.querySelector('[data-context-cta]');
    var detail = document.querySelector('[data-context-detail]');
    var detailKicker = document.querySelector('[data-context-detail-kicker]');
    var detailTitle = document.querySelector('[data-context-detail-title]');
    var detailCopy = document.querySelector('[data-context-detail-copy]');
    var detailLink = document.querySelector('[data-context-detail-link]');
    if (headline) headline.textContent = context.headline;
    if (description) description.textContent = context.description;
    if (benefit) benefit.textContent = context.benefit;
    if (detailKicker) detailKicker.textContent = context.detailKicker;
    if (detailTitle) detailTitle.textContent = context.detailTitle;
    if (detailCopy) detailCopy.textContent = context.detailCopy;
    if (detailLink) {
      detailLink.textContent = context.detailCtaLabel;
      detailLink.setAttribute('href', context.detailDestination);
    }
    if (cta) {
      cta.textContent = context.ctaLabel;
      cta.setAttribute('href', context.destination);
    }
    document.querySelectorAll('[data-context]').forEach(function (button) {
      button.setAttribute('aria-checked', button.dataset.context === context.id ? 'true' : 'false');
    });
    if (explicit) {
      try {
        window.sessionStorage.setItem(storageKey, context.id);
      } catch (_error) {
        // The page remains fully usable when session storage is unavailable.
      }
      activatePreview(context.demoId);
      if (detail) {
        detail.classList.remove('is-updated');
        window.requestAnimationFrame(function () {
          detail.classList.add('is-updated');
          detail.focus({ preventScroll: true });
        });
      }
    }
    current = context.id;
    propagateCampaignParameters();
  }

  function applyQuizVariant() {
    if (intent !== 'quiz' || config.contexts[stored]) return;
    var variant = config.quizVariant;
    document.querySelector('[data-context-headline]').textContent = variant.headline;
    document.querySelector('[data-context-description]').textContent = variant.description;
    var cta = document.querySelector('[data-context-cta]');
    cta.textContent = variant.ctaLabel;
    cta.setAttribute('href', variant.destination);
  }

  document.querySelectorAll('[data-context]').forEach(function (button) {
    button.addEventListener('click', function () {
      applyContext(button.dataset.context, true);
    });
    button.addEventListener('keydown', function (event) {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowDown'
        && event.key !== 'ArrowLeft' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      var buttons = Array.from(document.querySelectorAll('[data-context]'));
      var offset = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1;
      var next = buttons[(buttons.indexOf(button) + offset + buttons.length) % buttons.length];
      next.focus();
      applyContext(next.dataset.context, true);
    });
  });

  applyContext(current, false);
  applyQuizVariant();
  propagateCampaignParameters();
}());
