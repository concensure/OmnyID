import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/measure.js', import.meta.url), 'utf8');
const rootHome = fs.readFileSync(new URL('../../docs/index.html', import.meta.url), 'utf8');
const storage = new Map();

function page(pathname, { beacon = false, privacy = false } = {}) {
  const timers = [];
  const listeners = new Map();
  const requests = [];
  const beacons = [];
  const sessionStorage = {
    getItem(key) { return storage.get(key) ?? null; },
    setItem(key, value) { storage.set(key, String(value)); }
  };
  const body = {
    classList: { contains(name) { return name === 'landing-v2' && pathname.startsWith('/wedding'); } }
  };
  const document = {
    body,
    referrer: '',
    visibilityState: 'visible',
    addEventListener(name, callback) { listeners.set(`document:${name}`, callback); },
    querySelectorAll() { return []; }
  };
  const context = {
    Blob,
    URL,
    URLSearchParams,
    console,
    crypto: crypto.webcrypto,
    document,
    fetch(url, options) {
      requests.push({ url, options, payload: JSON.parse(options.body) });
      return Promise.resolve({ ok: true, status: 204 });
    },
    innerWidth: 390,
    location: { pathname, search: '', hostname: 'omnyid.com' },
    navigator: {
      doNotTrack: privacy ? '1' : '0',
      globalPrivacyControl: false,
      language: 'en-AU',
      sendBeacon(url, blob) {
        if (!beacon) return false;
        beacons.push({ url, blob });
        return true;
      }
    },
    sessionStorage,
    setTimeout(callback) { timers.push(callback); return timers.length; },
    clearTimeout() {}
  };
  context.window = context;
  context.window.addEventListener = (name, callback) => listeners.set(`window:${name}`, callback);
  vm.runInNewContext(source, context, { filename: 'measure.js' });
  return { context, timers, listeners, requests, beacons };
}

async function settle() {
  await Promise.resolve();
  await new Promise((resolve) => setImmediate(resolve));
}

const root = page('/', { beacon: true });
const visitId = storage.get('omnyid.public.visit.v1');
assert.match(visitId, /^[a-z0-9]{12}$/i);
root.context.OmnyWeddingMeasure.track('wedding_cta_clicked', { cta_id: 'start_planning' });
root.listeners.get('window:pagehide')();
assert.equal(root.beacons.length, 1);
const beaconPayload = JSON.parse(await root.beacons[0].blob.text());
assert.equal(beaconPayload.schema_version, 'public-measurement.v1');
assert.equal(beaconPayload.visit_id, visitId);
assert.equal(beaconPayload.session.landing_path, '/');
assert.equal(beaconPayload.events.length, 2);
assert.ok(beaconPayload.events.every((event) => /^[a-z0-9]{20}$/i.test(event.event_id)));

const wedding = page('/wedding/');
assert.equal(storage.get('omnyid.public.visit.v1'), visitId);
assert.equal(wedding.timers.length > 0, true);
wedding.timers.shift()();
await settle();
assert.equal(wedding.requests.length, 1);
const retryPayload = wedding.requests[0].payload;
assert.equal(retryPayload.visit_id, visitId);
assert.equal(retryPayload.session.landing_path, '/');
assert.deepEqual(
  retryPayload.events.slice(0, 2).map((event) => event.event_id),
  beaconPayload.events.map((event) => event.event_id)
);
assert.equal(retryPayload.events[2].event, 'wedding_landing_view');
assert.deepEqual(JSON.parse(storage.get('omnyid.public.events.v1')), []);

storage.clear();
const privatePage = page('/wedding/', { privacy: true });
assert.equal(privatePage.requests.length, 0);
assert.equal(storage.size, 0);
assert.equal(privatePage.context.OmnyWeddingMeasure, undefined);

assert.equal(source.includes('google-analytics'), false);
assert.equal(source.includes('connect.facebook.net'), false);
assert.match(rootHome, /<script src="\/wedding\/assets\/js\/measure\.js" defer><\/script>/);
console.log('measurement replay smoke passed');
