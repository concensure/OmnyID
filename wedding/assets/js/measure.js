(function () {
  'use strict';

  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
      window.doNotTrack === '1') return;

  var queue = [], sentSession = false, timer = null, started = Date.now(), finished = false;
  var visitId;
  try {
    visitId = sessionStorage.getItem('omnyid.wedding.visit.v1');
    if (!/^[a-zA-Z0-9]{12}$/.test(visitId || '')) {
      var bytes = crypto.getRandomValues(new Uint8Array(9));
      visitId = Array.from(bytes, function (value) {
        return value.toString(36).padStart(2, '0');
      }).join('').slice(0, 12);
      sessionStorage.setItem('omnyid.wedding.visit.v1', visitId);
    }
  } catch (_) {
    visitId = Math.random().toString(36).slice(2, 14).padEnd(12, '0');
  }

  function clean(value) {
    value = String(value || '').trim().toLowerCase();
    return /^[a-z0-9 _-]{1,40}$/.test(value) ? value : null;
  }

  function referrer() {
    if (!document.referrer) return { referrer_class: 'direct' };
    try {
      var host = new URL(document.referrer).hostname.toLowerCase();
      if (host === location.hostname) return { referrer_class: 'internal' };
      var search = ['google.', 'bing.', 'duckduckgo.', 'yahoo.'];
      var social = ['instagram.com', 'tiktok.com', 'facebook.com', 'reddit.com', 'pinterest.'];
      var kind = search.some(function (item) { return host.indexOf(item) >= 0; }) ? 'search' :
        (social.some(function (item) { return host.indexOf(item) >= 0; }) ? 'social' : 'other');
      return { referrer_class: kind, referrer_host: host.slice(0, 100) };
    } catch (_) {
      return { referrer_class: 'other' };
    }
  }

  function session() {
    var query = new URLSearchParams(location.search), source = referrer();
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(function (key) {
      var value = clean(query.get(key));
      if (value) source[key] = value;
    });
    var intent = clean(query.get('intent'));
    if (intent) source.intent = intent;
    source.ad_click_present = ['gclid', 'fbclid', 'msclkid'].some(function (key) {
      return query.has(key);
    });
    source.device_class = innerWidth < 600 ? 'mobile' : (innerWidth < 1024 ? 'tablet' : 'desktop');
    source.language = String(navigator.language || '').slice(0, 2).toLowerCase();
    source.landing_path = location.pathname;
    return source;
  }

  function flush() {
    if (!queue.length) return;
    var payload = JSON.stringify({ visit_id: visitId, session: session(), events: queue.splice(0) });
    sentSession = true;
    if (navigator.sendBeacon && navigator.sendBeacon('/wedding/e', new Blob([payload], {
      type: 'application/json'
    }))) return;
    try {
      fetch('/wedding/e', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
        keepalive: true, credentials: 'same-origin'
      }).catch(function () {});
    } catch (_) {
      // Measurement must never interrupt the page when transport is unavailable.
    }
  }

  function track(event, props) {
    if (queue.length >= 32) return;
    queue.push({ event: event, page: location.pathname, props: props || {} });
    if (!timer) timer = window.setTimeout(function () { timer = null; flush(); }, 10000);
  }

  window.OmnyWeddingMeasure = { track: track };
  if (document.body.classList.contains('landing-v2')) track('wedding_landing_view');

  document.addEventListener('click', function (event) {
    var target = event.target.closest('a, button');
    if (!target) return;
    if (target.matches('[data-context]')) {
      track(sentSession ? 'wedding_context_changed' : 'wedding_context_selected', {
        context: target.getAttribute('data-context')
      });
    }
    if (target.matches('[data-context-cta], [href*="auth=register"]')) {
      track('wedding_cta_clicked', { cta_id: 'start_planning' });
    }
    if (target.matches('[href*="animal-quiz"]')) track('wedding_quiz_entry_clicked');
  });

  if ('IntersectionObserver' in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        if (id) track('wedding_section_viewed', { section_id: id.slice(0, 40) });
        observer.unobserve(entry.target);
      });
    }, { threshold: .35 });
    document.querySelectorAll('main section[id]').forEach(function (section) { observer.observe(section); });
  }

  function finish() {
    if (finished) return;
    finished = true;
    var seconds = Math.min(300, Math.floor((Date.now() - started) / 5000) * 5);
    if (seconds >= 5) track('wedding_engaged_time', { seconds_bucket: seconds });
    flush();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', finish);
}());
