(function () {
  'use strict';

  var form = document.querySelector('[data-binder-form]');
  if (!form) return;

  var email = form.querySelector('input[name="email"]');
  var optIn = form.querySelector('input[name="marketing_opt_in"]');
  var company = form.querySelector('input[name="company"]');
  var submit = form.querySelector('button[type="submit"]');
  var availability = document.getElementById('binderAvailability');
  var status = document.getElementById('binderStatus');
  var started = false;

  function track(event, props) {
    if (window.OmnyWeddingMeasure) window.OmnyWeddingMeasure.track(event, props);
  }

  function setEnabled(enabled) {
    email.disabled = !enabled;
    optIn.disabled = !enabled;
    submit.disabled = !enabled;
    submit.setAttribute('aria-disabled', String(!enabled));
    availability.textContent = enabled
      ? ''
      : 'Binder email delivery is being checked before it opens.';
  }

  function acquisition() {
    var query = new URLSearchParams(window.location.search);
    var width = window.innerWidth;
    return {
      utm_source: query.get('utm_source'),
      utm_medium: query.get('utm_medium'),
      utm_campaign: query.get('utm_campaign'),
      intent: query.get('intent'),
      device_class: width < 600 ? 'mobile' : (width < 1024 ? 'tablet' : 'desktop')
    };
  }

  fetch('/wedding/binder', { credentials: 'same-origin' })
    .then(function (response) { return response.ok ? response.json() : { enabled: false }; })
    .then(function (result) { setEnabled(result.enabled === true); })
    .catch(function () { setEnabled(false); });

  email.addEventListener('focus', function () {
    if (started) return;
    started = true;
    track('wedding_binder_form_started');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!form.reportValidity() || submit.disabled) return;
    submit.disabled = true;
    status.textContent = 'Sending your binder links…';
    var payload = acquisition();
    payload.email = email.value;
    payload.marketing_opt_in = optIn.checked;
    payload.company = company.value;
    fetch('/wedding/binder', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (body) {
        if (!response.ok) throw new Error(body.message || body.error || 'send_failed');
        return body;
      });
    }).then(function (body) {
      status.textContent = body.message || 'Check your inbox.';
      track('wedding_binder_submitted');
      form.reset();
    }).catch(function () {
      status.textContent = 'We could not send the binder yet. Please try again shortly.';
      track('wedding_binder_error', { error_type: 'delivery_unavailable' });
    }).finally(function () {
      submit.disabled = false;
    });
  });
}());
