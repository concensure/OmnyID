// OmnyID Weddings — shared interactivity
(function () {
  'use strict';

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
    navToggle.addEventListener('click', function () {
      var open = navLinks.classList.toggle('is-open');
      navToggle.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () {
        navLinks.classList.remove('is-open');
        navToggle.classList.remove('is-open');
      });
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
    var duration = 1400;
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
    tabRow.addEventListener('mouseenter', function () { clearInterval(autoTimer); });
    tabRow.addEventListener('mouseleave', scheduleAuto);
    tabRow.addEventListener('click', function () { idx = order.indexOf(document.querySelector('.tab-btn.is-active').getAttribute('data-tab')); });
    scheduleAuto();
  }

  /* ---------- testimonial carousel ---------- */
  var testiWrap = document.querySelector('.testi-wrap');
  if (testiWrap) {
    var slides = testiWrap.querySelectorAll('.testi-slide');
    var dots = testiWrap.querySelectorAll('.testi-dots button');
    var tIdx = 0;
    function showSlide(i) {
      slides.forEach(function (s, si) { s.classList.toggle('is-active', si === i); });
      dots.forEach(function (d, di) { d.classList.toggle('is-active', di === i); });
      tIdx = i;
    }
    dots.forEach(function (d, i) {
      d.addEventListener('click', function () { showSlide(i); restartAuto(); });
    });
    var testiTimer;
    function restartAuto() {
      clearInterval(testiTimer);
      testiTimer = setInterval(function () { showSlide((tIdx + 1) % slides.length); }, 5500);
    }
    if (slides.length) { showSlide(0); restartAuto(); }
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
      });
      if (!isOpen) {
        item.classList.add('is-open');
        a.style.maxHeight = a.scrollHeight + 'px';
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
    chips.forEach(function (chip) {
      chip.addEventListener('click', function () {
        chips.forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        var cat = chip.getAttribute('data-filter');
        cards.forEach(function (card) {
          var match = cat === 'all' || card.getAttribute('data-category') === cat;
          card.style.display = match ? '' : 'none';
        });
      });
    });
  }

  /* ---------- newsletter form (front-end only, no backend) ---------- */
  var newsletterForm = document.querySelector('.newsletter-form');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = newsletterForm.querySelector('button');
      var original = btn.textContent;
      btn.textContent = 'Subscribed ✓';
      btn.disabled = true;
      setTimeout(function () { btn.textContent = original; btn.disabled = false; newsletterForm.reset(); }, 2600);
    });
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

  /* ---------- waitlist: email capture -> popup for name + wedding date ---------- */
  var waitlistEmailForm = document.getElementById('waitlistEmailForm');
  var waitlistModal = document.getElementById('waitlistModal');
  if (waitlistEmailForm && waitlistModal) {
    var waitlistEmailInput = document.getElementById('waitlistEmail');
    var waitlistEmailError = document.getElementById('waitlistEmailError');
    var waitlistDetailsForm = document.getElementById('waitlistDetailsForm');
    var waitlistDetailsStatus = document.getElementById('waitlistDetailsStatus');
    var waitlistFormView = document.getElementById('waitlistFormView');
    var waitlistSuccessView = document.getElementById('waitlistSuccessView');
    var waitlistFirstName = document.getElementById('waitlistFirstName');
    var waitlistLastName = document.getElementById('waitlistLastName');
    var waitlistWeddingDate = document.getElementById('waitlistWeddingDate');
    var lastWaitlistTrigger = null;
    var confirmedEmail = '';

    var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function openWaitlistModal() {
      lastWaitlistTrigger = document.activeElement;
      waitlistModal.classList.add('is-open');
      waitlistModal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('no-scroll');
      setTimeout(function () {
        if (waitlistFirstName) waitlistFirstName.focus({ preventScroll: true });
      }, 0);
    }
    function closeWaitlistModal() {
      waitlistModal.classList.remove('is-open');
      waitlistModal.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('no-scroll');
      if (lastWaitlistTrigger && document.contains(lastWaitlistTrigger) && typeof lastWaitlistTrigger.focus === 'function') {
        lastWaitlistTrigger.focus();
      }
    }
    waitlistModal.querySelectorAll('[data-close-waitlist]').forEach(function (el) {
      el.addEventListener('click', closeWaitlistModal);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && waitlistModal.classList.contains('is-open')) closeWaitlistModal();
    });

    waitlistEmailForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var value = (waitlistEmailInput.value || '').trim();
      var isValid = EMAIL_PATTERN.test(value);
      waitlistEmailInput.setAttribute('aria-invalid', isValid ? 'false' : 'true');
      if (waitlistEmailError) waitlistEmailError.classList.toggle('is-visible', !isValid);
      if (!isValid) return;

      confirmedEmail = value;
      if (waitlistEmailError) waitlistEmailError.classList.remove('is-visible');

      /* reset the popup to its form state each time it's reopened */
      if (waitlistFormView) waitlistFormView.hidden = false;
      if (waitlistSuccessView) waitlistSuccessView.hidden = true;
      if (waitlistDetailsForm) {
        waitlistDetailsForm.reset();
        waitlistDetailsForm.querySelector('button[type="submit"]').disabled = false;
      }
      if (waitlistDetailsStatus) {
        waitlistDetailsStatus.textContent = '';
        waitlistDetailsStatus.className = 'waitlist-status';
      }
      openWaitlistModal();
    });

    if (waitlistDetailsForm) {
      waitlistDetailsForm.addEventListener('submit', function (e) {
        e.preventDefault();
        var firstName = (waitlistFirstName.value || '').trim();
        var lastName = (waitlistLastName.value || '').trim();
        var weddingDate = (waitlistWeddingDate && waitlistWeddingDate.value) || '';

        waitlistFirstName.setAttribute('aria-invalid', firstName ? 'false' : 'true');
        waitlistLastName.setAttribute('aria-invalid', lastName ? 'false' : 'true');
        if (!firstName || !lastName) {
          if (waitlistDetailsStatus) {
            waitlistDetailsStatus.textContent = 'Please add your first and last name.';
            waitlistDetailsStatus.className = 'waitlist-status is-error';
          }
          return;
        }

        var submitBtn = waitlistDetailsForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        if (waitlistDetailsStatus) {
          waitlistDetailsStatus.textContent = 'Submitting…';
          waitlistDetailsStatus.className = 'waitlist-status';
        }

        fetch('/wedding/waitlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: confirmedEmail,
            first_name: firstName,
            last_name: lastName,
            expected_wedding_date: weddingDate || null
          })
        }).then(function (response) {
          if (!response.ok) {
            return response.json().catch(function () { return {}; }).then(function (payload) {
              throw new Error((payload && payload.error) || 'Something went wrong. Please try again.');
            });
          }
          return response.json();
        }).then(function () {
          if (waitlistFormView) waitlistFormView.hidden = true;
          if (waitlistSuccessView) waitlistSuccessView.hidden = false;
          if (waitlistFirstName) {
            var successFocus = waitlistSuccessView && waitlistSuccessView.querySelector('button');
            if (successFocus) successFocus.focus({ preventScroll: true });
          }
        }).catch(function (err) {
          submitBtn.disabled = false;
          if (waitlistDetailsStatus) {
            waitlistDetailsStatus.textContent = err.message || 'Something went wrong. Please try again.';
            waitlistDetailsStatus.className = 'waitlist-status is-error';
          }
        });
      });
    }
  }

  /* ---------- current year ---------- */
  document.querySelectorAll('[data-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
})();
