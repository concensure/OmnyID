(function () {
  'use strict';

  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' ||
      window.doNotTrack === '1') return;

  var SCHEMA_VERSION = 'public-measurement.v1';
  var VISIT_KEY = 'omnyid.public.visit.v1';
  var LEGACY_VISIT_KEY = 'omnyid.wedding.visit.v1';
  var SESSION_KEY = 'omnyid.public.session.v1';
  var PENDING_KEY = 'omnyid.public.events.v1';
  var MAX_PENDING = 96;
  var queue = loadPending(), sentSession = false, timer = null;
  var started = Date.now(), finished = false, flushing = false;
  var lcp = 0, cls = 0, interruptionSent = false;

  function randomId(length) {
    try {
      var bytes = crypto.getRandomValues(new Uint8Array(length));
      return Array.from(bytes, function (value) {
        return (value % 36).toString(36);
      }).join('');
    } catch (_) {
      var value = '';
      while (value.length < length) value += Math.random().toString(36).slice(2);
      return value.slice(0, length);
    }
  }

  function stored(key) {
    try { return sessionStorage.getItem(key); } catch (_) { return null; }
  }

  function save(key, value) {
    try { sessionStorage.setItem(key, value); } catch (_) {}
  }

  var visitId = stored(VISIT_KEY) || stored(LEGACY_VISIT_KEY);
  if (!/^[a-zA-Z0-9]{12}$/.test(visitId || '')) visitId = randomId(12);
  save(VISIT_KEY, visitId);

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

  function newSession() {
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

  function loadSession() {
    try {
      var value = JSON.parse(stored(SESSION_KEY) || 'null');
      if (value && typeof value === 'object' && typeof value.landing_path === 'string') return value;
    } catch (_) {}
    var value = newSession();
    save(SESSION_KEY, JSON.stringify(value));
    return value;
  }

  function loadPending() {
    try {
      var value = JSON.parse(stored(PENDING_KEY) || '[]');
      return Array.isArray(value) ? value.filter(function (event) {
        return event && /^[a-zA-Z0-9]{16,32}$/.test(event.event_id || '');
      }).slice(-MAX_PENDING) : [];
    } catch (_) { return []; }
  }

  var session = loadSession();

  function savePending() {
    save(PENDING_KEY, JSON.stringify(queue.slice(-MAX_PENDING)));
  }

  function acknowledge(ids) {
    queue = queue.filter(function (event) { return ids.indexOf(event.event_id) < 0; });
    savePending();
  }

  function schedule(delay) {
    if (timer) return;
    timer = window.setTimeout(function () { timer = null; flush(false); }, delay);
  }

  function flush(preferBeacon) {
    if (!queue.length || flushing) return;
    var events = queue.slice(0, 32);
    var payload;
    do {
      payload = JSON.stringify({
        schema_version: SCHEMA_VERSION,
        visit_id: visitId,
        session: session,
        events: events
      });
      if (new Blob([payload]).size <= 3800 || events.length === 1) break;
      events.pop();
    } while (events.length);
    if (new Blob([payload]).size > 3800) {
      acknowledge([events[0].event_id]);
      if (queue.length) schedule(0);
      return;
    }
    sentSession = true;
    if (preferBeacon && navigator.sendBeacon && navigator.sendBeacon('/wedding/e', new Blob([payload], {
      type: 'application/json'
    }))) {
      // Keep the same IDs until a later acknowledged request; server deduplication makes replay safe.
      return;
    }
    flushing = true;
    try {
      fetch('/wedding/e', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload,
        keepalive: true, credentials: 'same-origin'
      }).then(function (response) {
        if (response.ok) acknowledge(events.map(function (event) { return event.event_id; }));
      }).catch(function () {}).finally(function () {
        flushing = false;
        if (queue.length && document.visibilityState !== 'hidden') schedule(10000);
      });
    } catch (_) {
      flushing = false;
    }
  }

  function track(event, props) {
    if (queue.length >= MAX_PENDING) return;
    queue.push({
      event_id: randomId(20), event: event, page: location.pathname, props: props || {}
    });
    savePending();
    schedule(10000);
  }

  window.OmnyWeddingMeasure = { track: track };
  if (location.pathname === '/') track('omnyid_landing_view');
  if (document.body.classList.contains('landing-v2')) track('wedding_landing_view');

  function speedBucket(value, good, slow) {
    if (!isFinite(value) || value < 0) return 'unknown';
    return value <= good ? 'good' : (value <= slow ? 'needs_attention' : 'slow');
  }
  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) { lcp = Math.max(lcp, entry.startTime || 0); });
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver(function (list) {
        list.getEntries().forEach(function (entry) { if (!entry.hadRecentInput) cls += entry.value || 0; });
      }).observe({ type: 'layout-shift', buffered: true });
    } catch (_) {}
  }
  function reportInterruption(kind) {
    if (interruptionSent) return;
    interruptionSent = true;
    track('public_page_interruption', { interruption_type: kind });
  }
  window.addEventListener('error', function (event) {
    if (event.target === window) reportInterruption('script_error');
  });
  window.addEventListener('unhandledrejection', function () { reportInterruption('promise_rejection'); });
  function reportPerformance() {
    window.setTimeout(function () {
      var navigation = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      var load = navigation ? navigation.loadEventEnd : Date.now() - started;
      track('public_page_performance', {
        load_bucket: speedBucket(load, 1500, 3000),
        lcp_bucket: speedBucket(lcp, 2500, 4000),
        cls_bucket: speedBucket(cls, 0.1, 0.25)
      });
    }, 1000);
  }
  if (document.readyState === 'complete') reportPerformance();
  else window.addEventListener('load', reportPerformance, { once: true });

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

  if ('IntersectionObserver' in window && location.pathname.indexOf('/wedding') === 0) {
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
    if (seconds >= 5 && location.pathname.indexOf('/wedding') === 0) {
      track('wedding_engaged_time', { seconds_bucket: seconds });
    }
    flush(true);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', finish);
  if (queue.length) schedule(250);
}());
