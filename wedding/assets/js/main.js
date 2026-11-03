// OmnyID Weddings — shared interactivity
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- header scroll state ---------- */
  var header = document.querySelector('.site-header');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- mobile nav toggle ---------- */
  var navToggle = document.getElementById('navToggle');
  var navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    var setNav = function (open) {
      navLinks.classList.toggle('is-open', open);
      navToggle.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    navToggle.addEventListener('click', function () {
      setNav(!navLinks.classList.contains('is-open'));
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setNav(false); });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && navLinks.classList.contains('is-open')) {
        setNav(false);
        navToggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (navLinks.classList.contains('is-open') && !navLinks.contains(e.target) && !navToggle.contains(e.target)) {
        setNav(false);
      }
    });
  }

  /* ---------- scroll reveal ---------- */
  var revealEls = document.querySelectorAll('.reveal, .reveal-stagger');
  if ('IntersectionObserver' in window && revealEls.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- animated counters ---------- */
  var counters = document.querySelectorAll('[data-count-to]');
  if ('IntersectionObserver' in window && counters.length) {
    var counted = new WeakSet();
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting && !counted.has(entry.target)) {
          counted.add(entry.target);
          animateCount(entry.target);
        }
      });
    }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  }
  function animateCount(el) {
    var to = parseFloat(el.getAttribute('data-count-to'));
    var suffix = el.getAttribute('data-suffix') || '';
    var prefix = el.getAttribute('data-prefix') || '';
    var decimals = el.getAttribute('data-decimals') ? parseInt(el.getAttribute('data-decimals'), 10) : 0;
    var duration = reduceMotion ? 0 : 1400;
    var start = null;
    function step(ts) {
      if (!start) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var eased = 1 - Math.pow(1 - progress, 3);
      var val = to * eased;
      el.textContent = prefix + val.toFixed(decimals) + suffix;
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = prefix + to.toFixed(decimals) + suffix;
    }
    requestAnimationFrame(step);
  }

  /* ---------- animated budget bars (trigger width transition) ---------- */
  var bars = document.querySelectorAll('.mock-bar-fill');
  if ('IntersectionObserver' in window && bars.length) {
    var bio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var target = entry.target.getAttribute('data-width') || '0%';
          entry.target.style.width = target;
          bio.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });
    bars.forEach(function (el) { bio.observe(el); });
  }

  /* ---------- product preview tabs ---------- */
  var tabRow = document.querySelector('.tab-row');
  if (tabRow) {
    var tabs = tabRow.querySelectorAll('.tab-btn');
    var railLinks = document.querySelectorAll('.preview-rail a');
    var panes = document.querySelectorAll('.pane');
    function activate(key) {
      tabs.forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-tab') === key); });
      railLinks.forEach(function (r) { r.classList.toggle('is-active', r.getAttribute('data-tab') === key); });
      panes.forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('data-pane') === key); });
      panes.forEach(function (p) {
        if (p.getAttribute('data-pane') === key) {
          p.querySelectorAll('.mock-bar-fill').forEach(function (bar) {
            var target = bar.getAttribute('data-width') || '0%';
            bar.style.width = '0%';
            requestAnimationFrame(function () {
              requestAnimationFrame(function () { bar.style.width = target; });
            });
          });
        }
      });
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () { activate(t.getAttribute('data-tab')); });
    });
    railLinks.forEach(function (r) {
      r.addEventListener('click', function (e) {
        e.preventDefault();
        activate(r.getAttribute('data-tab'));
      });
    });

    /* gentle auto-advance so the preview feels alive, pauses on interaction */
    var order = Array.prototype.map.call(tabs, function (t) { return t.getAttribute('data-tab'); });
    var idx = 0;
    var autoTimer = null;
    function scheduleAuto() {
      clearInterval(autoTimer);
      autoTimer = setInterval(function () {
        idx = (idx + 1) % order.length;
        activate(order[idx]);
      }, 4200);
    }
    var previewShell = tabRow.closest('.preview-shell') || tabRow;
    var stopAuto = function () { clearInterval(autoTimer); };
    ['mouseenter', 'focusin', 'click', 'touchstart'].forEach(function (evt) {
      previewShell.addEventListener(evt, stopAuto, { passive: true });
    });
    if (!reduceMotion) scheduleAuto();
  }

  /* ---------- FAQ accordion ---------- */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    var a = item.querySelector('.faq-a');
    if (!q || !a) return;
    q.addEventListener('click', function () {
      var isOpen = item.classList.contains('is-open');
      item.closest('.faq-list').querySelectorAll('.faq-item').forEach(function (other) {
        other.classList.remove('is-open');
        other.querySelector('.faq-a').style.maxHeight = null;
        other.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
      });
      if (!isOpen) {
        item.classList.add('is-open');
        a.style.maxHeight = a.scrollHeight + 'px';
        q.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* ---------- pricing monthly/annual toggle (cosmetic label swap) ---------- */
  var pricingSwitch = document.getElementById('billingSwitch');
  if (pricingSwitch) {
    var labelMonthly = document.getElementById('labelMonthly');
    var labelAnnual = document.getElementById('labelAnnual');
    pricingSwitch.addEventListener('click', function () {
      var isOn = pricingSwitch.classList.toggle('is-on');
      labelMonthly.classList.toggle('is-active', !isOn);
      labelAnnual.classList.toggle('is-active', isOn);
      document.querySelectorAll('[data-annual-note]').forEach(function (el) {
        el.style.display = isOn ? 'inline' : 'none';
      });
    });
  }

  /* ---------- blog category filter ---------- */
  var filterRow = document.querySelector('.blog-filter');
  if (filterRow) {
    var chips = filterRow.querySelectorAll('.filter-chip');
    var cards = document.querySelectorAll('.blog-card');
    var searchInput = filterRow.querySelector('[data-blog-search]');
    var searchStatus = document.querySelector('[data-blog-search-status]');
    var selectedCategory = 'all';
    function filterCards() {
      cards = document.querySelectorAll('.blog-card');
      var query = (searchInput && searchInput.value || '').trim().toLowerCase();
      var visibleCount = 0;
      cards.forEach(function (card) {
        var haystack = [card.getAttribute('data-keywords'), card.textContent].join(' ').toLowerCase();
        var matchesCategory = selectedCategory === 'all' || card.getAttribute('data-category') === selectedCategory;
        var matchesQuery = !query || haystack.indexOf(query) !== -1;
        var match = matchesCategory && matchesQuery;
        card.style.display = match ? '' : 'none';
        if (match) visibleCount += 1;
      });
      if (searchStatus) searchStatus.textContent = visibleCount + (visibleCount === 1 ? ' guide found.' : ' guides found.');
    }
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        selectedCategory = chip.getAttribute('data-filter') || 'all';
        filterCards();
      });
    });
    if (searchInput) searchInput.addEventListener('input', filterCards);
    document.addEventListener('wedding:blog-publications-loaded', filterCards);
  }

  /* ---------- sign-in / register bridge modal ---------- */
  var signinModal = document.getElementById('signinModal');
  if (signinModal) {
    var signinOptionCards = signinModal.querySelectorAll('.signin-option');
    var lastSigninTrigger = null;

    function authModeFor(mode) {
      if (mode === 'signin' || mode === 'agent-id') return mode;
      return 'register';
    }

    function withAuthParams(url, mode) {
      try {
        var target = new URL(url, window.location.href);
        target.searchParams.set('auth', authModeFor(mode));
        target.searchParams.set('source', 'wedding');
        return target.href;
      } catch (error) {
        var cleanUrl = url.replace(/#.*$/, '');
        var separator = cleanUrl.indexOf('?') === -1 ? '?' : '&';
        return cleanUrl + separator + 'auth=' + encodeURIComponent(authModeFor(mode)) + '&source=wedding';
      }
    }

    function updateSigninLinks(mode) {
      signinOptionCards.forEach(function (card) {
        var cardMode = card.getAttribute('data-option') || mode;
        var link = card.querySelector('a[href]');
        if (link) {
          link.href = withAuthParams(link.getAttribute('href') || '../workspace/', cardMode);
        }
      });
      signinModal.querySelectorAll('[data-agent-id-link]').forEach(function (link) {
        link.href = withAuthParams(link.getAttribute('href') || '../workspace/', 'agent-id');
      });
    }

    function modalIsOpen() {
      return signinModal.classList.contains('is-open');
    }

    function focusableSigninEls() {
      return Array.prototype.slice.call(signinModal.querySelectorAll([
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])'
      ].join(','))).filter(function (el) {
        return el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement;
      });
    }

    function openSignin(mode) {
      lastSigninTrigger = document.activeElement;
      signinModal.classList.add('is-open');
      signinModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      updateSigninLinks(mode || 'register');
      signinOptionCards.forEach(function (card) {
        card.classList.toggle('is-primary', card.getAttribute('data-option') === mode);
      });
      setTimeout(function () {
        var focusTarget = signinModal.querySelector('.signin-option.is-primary a') || signinModal.querySelector('.signin-close');
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      }, 0);
    }
    function closeSignin() {
      signinModal.classList.remove('is-open');
      signinModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      if (lastSigninTrigger && document.contains(lastSigninTrigger) && typeof lastSigninTrigger.focus === 'function') {
        lastSigninTrigger.focus();
      }
    }
    document.querySelectorAll('[data-open-signin]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        if (btn.getAttribute('data-session-authenticated') === 'true') return;
        e.preventDefault();
        openSignin(btn.getAttribute('data-signin-mode') || 'register');
      });
    });
    signinModal.querySelectorAll('[data-close-signin]').forEach(function (el) {
      el.addEventListener('click', closeSignin);
    });
    document.addEventListener('keydown', function (e) {
      if (!modalIsOpen()) return;
      if (e.key === 'Escape') {
        closeSignin();
        return;
      }
      if (e.key !== 'Tab') return;
      var focusable = focusableSigninEls();
      if (!focusable.length) return;
      var first = focusable[0];
      var last = focusable[focusable.length - 1];
      if (!signinModal.contains(document.activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    });
  }

  /* ---------- newsletter signup ---------- */
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  document.querySelectorAll('[data-newsletter-form]').forEach(function (form) {
    var input = form.querySelector('input[type="email"]');
    var button = form.querySelector('button[type="submit"]');
    var status = document.getElementById(input.getAttribute('aria-describedby'));
    function show(message, kind) {
      if (!status) return;
      status.textContent = message;
      status.className = 'newsletter-status' + (kind ? ' is-' + kind : '');
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = (input.value || '').trim();
      var valid = EMAIL_PATTERN.test(email);
      input.setAttribute('aria-invalid', valid ? 'false' : 'true');
      if (!valid) {
        show('Please enter a valid email address.', 'error');
        input.focus();
        return;
      }
      button.disabled = true;
      show('Subscribing…', '');
      fetch('/wedding/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: form.getAttribute('data-newsletter-source') || 'wedding_site' })
      }).then(function (response) {
        if (!response.ok) {
          return response.text().then(function (text) {
            throw new Error(text || 'Something went wrong. Please try again.');
          });
        }
        return response.json();
      }).then(function () {
        form.reset();
        show("Thanks, you're subscribed. We'll email you when we publish new planning guides.", 'success');
      }).catch(function (err) {
        show(err.message || 'Something went wrong. Please try again.', 'error');
      }).then(function () {
        button.disabled = false;
      });
    });
  });

  /* ---------- Wedding Understanding: result-only browser storage ---------- */
  var understandingForm = document.querySelector('[data-wedding-understanding-form]');
  if (understandingForm) {
    var understandingStatus = understandingForm.querySelector('[data-understanding-status]');
    var understandingResult = document.querySelector('[data-understanding-result]');
    function understandingMessage(message, kind) {
      understandingStatus.textContent = message;
      understandingStatus.className = 'newsletter-status' + (kind ? ' is-' + kind : '');
    }
    var UNDERSTANDING_FALLBACK_ERROR = 'We could not reflect this right now. Please try again in a little while.';
    // Rough Sydney ranges in AUD for orientation only; real quotes vary by vendor and date.
    var COST_COMPONENTS = [
      { label: 'Venue hire', flat: [3000, 10000] },
      { label: 'Catering and drinks', perGuest: [120, 220] },
      { label: 'Photography', flat: [3000, 6000] },
      { label: 'Videography', flat: [2000, 4500] },
      { label: 'Attire, hair and makeup', flat: [2500, 6000] },
      { label: 'Flowers and styling', flat: [2000, 6000] },
      { label: 'Music and entertainment', flat: [1500, 4500] },
      { label: 'Celebrant and legal', flat: [600, 1200] },
      { label: 'Stationery, cake and transport', flat: [1500, 4000] }
    ];
    var DEFAULT_GUESTS = 80;
    function guestCountFrom(text) {
      var match = /(\d{1,3})\s*(?:guests?|people|ppl|pax)\b/i.exec(text) || /\b(?:guests?|people)\s*(?:of|:|about|around)?\s*(\d{1,3})\b/i.exec(text);
      var count = match ? parseInt(match[1], 10) : 0;
      return count >= 10 && count <= 300 ? count : 0;
    }
    function money(value) {
      return '$' + (Math.round(value / 100) * 100).toLocaleString('en-AU');
    }
    function renderCostBreakdown(text) {
      var container = understandingResult.querySelector('[data-understanding-costs]');
      var body = container.querySelector('[data-costs-body]');
      var guests = guestCountFrom(text);
      var count = guests || DEFAULT_GUESTS;
      var lowTotal = 0;
      var highTotal = 0;
      body.textContent = '';
      function addRow(label, low, high, isTotal) {
        var row = document.createElement('tr');
        if (isTotal) row.className = 'is-total';
        var name = document.createElement('td');
        name.textContent = label;
        var range = document.createElement('td');
        range.textContent = money(low) + ' – ' + money(high);
        row.appendChild(name);
        row.appendChild(range);
        body.appendChild(row);
      }
      COST_COMPONENTS.forEach(function (item) {
        var low = item.perGuest ? item.perGuest[0] * count : item.flat[0];
        var high = item.perGuest ? item.perGuest[1] * count : item.flat[1];
        lowTotal += low;
        highTotal += high;
        addRow(item.label, low, high, false);
      });
      addRow('Estimated total', lowTotal, highTotal, true);
      container.querySelector('[data-costs-note]').textContent = (guests
        ? 'Based on the ' + count + ' guests you mentioned. '
        : 'You did not mention a guest count, so this assumes ' + count + ' guests. ') +
        'Rough Sydney ranges in AUD for orientation only, not quotes.';
      container.hidden = false;
    }
    function failureMessage(response) {
      if (response.status === 429) return 'You have reached the limit for today. Please try again tomorrow.';
      var type = response.headers.get('content-type') || '';
      if (response.status === 400 && type.indexOf('text/plain') === 0) {
        return response.text().then(function (body) {
          return body && body.length < 200 ? body : UNDERSTANDING_FALLBACK_ERROR;
        });
      }
      return UNDERSTANDING_FALLBACK_ERROR;
    }
    function imagePayload(file) {
      return new Promise(function (resolve, reject) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
          reject(new Error('Please use a JPEG, PNG, or WebP image.'));
          return;
        }
        var reader = new FileReader();
        reader.onerror = function () { reject(new Error('A photo could not be read.')); };
        reader.onload = function () {
          var image = new Image();
          image.onerror = function () { reject(new Error('A photo could not be prepared.')); };
          image.onload = function () {
            var maxEdge = 1280;
            var scale = Math.min(1, maxEdge / Math.max(image.naturalWidth || 1, image.naturalHeight || 1));
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
            var context = canvas.getContext('2d');
            if (!context) { reject(new Error('A photo could not be prepared.')); return; }
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            var encoded = canvas.toDataURL('image/jpeg', 0.8).split(',')[1] || '';
            if (!encoded) { reject(new Error('A photo could not be prepared.')); return; }
            resolve({ data_base64: encoded, media_type: 'image/jpeg' });
          };
          image.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
      });
    }
    understandingForm.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = (understandingForm.querySelector('[name="text"]').value || '').trim();
      var files = Array.prototype.slice.call(understandingForm.querySelector('[name="images"]').files || []).slice(0, 3);
      var button = understandingForm.querySelector('button[type="submit"]');
      button.disabled = true;
      understandingMessage('Reflecting your ideas…', '');
      Promise.all(files.map(imagePayload))
        .then(function (images) {
          return fetch('/wedding/understanding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, images: images, company: (understandingForm.querySelector('[name="company"]').value || '') })
          });
        })
        .then(function (response) {
          if (!response.ok) {
            return Promise.resolve(failureMessage(response)).then(function (message) { throw new Error(message); });
          }
          return response.json();
        })
        .then(function (result) {
          if (!result || !result.core_theme) throw new Error(UNDERSTANDING_FALLBACK_ERROR);
          var record = {
            version: 1,
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            core_theme: result.core_theme,
            preferences: Array.isArray(result.preferences) ? result.preferences.slice(0, 12) : [],
            largest_tension: result.largest_tension || null,
            opening_observation: result.opening_observation || null
          };
          try { localStorage.setItem('omnyid.wedding.understanding.v1', JSON.stringify(record)); }
          catch (error) { console.warn('Wedding Understanding result could not be stored locally; it remains visible on this page.', error); }
          understandingResult.querySelector('[data-understanding-observation]').textContent = record.opening_observation || '';
          understandingResult.querySelector('[data-understanding-theme]').textContent = record.core_theme;
          understandingResult.querySelector('[data-understanding-pairs]').textContent = record.preferences.map(function (pair) { return pair.a + ' over ' + pair.b; }).join(' · ');
          understandingResult.querySelector('[data-understanding-tension]').textContent = record.largest_tension || '';
          renderCostBreakdown(text);
          understandingResult.hidden = false;
          understandingResult.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
          understandingMessage('Your result is ready.', 'success');
        })
        .catch(function (error) {
          var known = error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof TypeError);
          understandingMessage(known && error.message ? error.message : UNDERSTANDING_FALLBACK_ERROR, 'error');
        })
        .then(function () { button.disabled = false; });
    });
  }

  /* ---------- current year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
