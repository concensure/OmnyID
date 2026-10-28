// The Wedding Animal Quiz — UI. Answers stay on this device; share links carry them in the URL hash only.
(function () {
  'use strict';

  var D = window.OmnyQuizData, E = window.OmnyQuizEngine;
  var app = document.getElementById('quizApp');
  if (!app || !D || !E) return;

  var STORE_KEY = 'omnyid.wedding.quiz.v1';
  var LEGACY_BRIEF_KEY = 'omnyid.wedding.coupleBrief.v1';
  var HANDOFF_KEY = 'omnyid.wedding.animal_quiz.handoff.v1';
  var DEAL_BREAKER_LABELS = { debt: 'Going into debt', conflict: 'Family conflict', nophotos: 'No photos of the day',
    boring: 'A boring party', generic: 'Feeling generic', stress: 'Planning stress' };
  var IMG = 'assets/images/quiz/';
  var S = { stage: 'intro', list: D.SOLO, phase: 'solo', qi: 0, me: { name: '', answers: {}, done: false },
    partner: null, joint: {}, jointDone: false, zoo: null, friend: null };
  var toastTimer = null, advanceTimer = null;

  /* ---------- helpers ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function animal(i) { return D.ANIMALS[i]; }
  function photo(a) { return IMG + a.photo + '.webp'; }
  function baseUrl() { return location.origin + location.pathname; }
  function priorityLabel(id) { return E.byId(D.PRIORITIES, id).label; }

  function store(write) {
    try {
      if (write) localStorage.setItem(STORE_KEY, JSON.stringify({ me: S.me, partner: S.partner, joint: S.joint, jointDone: S.jointDone }));
      else {
        var raw = localStorage.getItem(STORE_KEY);
        if (!raw) return null;
        if (raw.length > 100000) { localStorage.removeItem(STORE_KEY); return null; }
        var parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      }
    } catch (err) {
      console.warn('Quiz progress could not be saved in this browser (private mode or blocked storage). The quiz still works.', err);
    }
    return null;
  }
  function clearStore() {
    try {
      localStorage.removeItem(STORE_KEY);
      localStorage.removeItem(LEGACY_BRIEF_KEY);
      localStorage.removeItem(HANDOFF_KEY);
    } catch (err) { console.warn('Could not clear saved quiz progress.', err); }
  }

  function toast(msg) {
    var el = document.getElementById('qzToast');
    el.textContent = msg;
    el.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('is-on'); }, 2600);
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    }
    var ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    return Promise.resolve(ok);
  }

  /* ---------- derived state ---------- */
  function couple() {
    var hasJoint = S.jointDone || Object.keys(S.joint).length > 0;
    return E.buildCouple({ a: S.me.answers, b: S.partner ? S.partner.answers : null, joint: hasJoint ? S.joint : null,
      names: [S.me.name, S.partner ? S.partner.name : ''] });
  }
  function publishBrief(res) {
    window.OmnyQuiz = { getBrief: function () { return JSON.parse(JSON.stringify(res.brief)); } };
    window.dispatchEvent(new CustomEvent('omnyid:quiz-brief', { detail: res.brief }));
  }
  function writeProfileHandoff(res) {
    var b = res.brief, now = new Date();
    var familyQuestion = E.byId(D.JOINT, 'family');
    var familyChoice = familyQuestion && b.family_involvement
      ? E.byId(familyQuestion.opts, b.family_involvement) : null;
    var handoff = {
      version: 1,
      created_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      animal_title: String(res.animal.title || '').slice(0, 120) || null,
      guest_range: b.guests.range ? { min: b.guests.range.min, max: b.guests.range.max } : null,
      budget_comfort: b.budget.comfort ? String(b.budget.comfort.label || '').slice(0, 120) : null,
      budget_stretch: b.budget.stretch ? String(b.budget.stretch.label || '').slice(0, 120) : null,
      location: String(b.location.region_label || '').slice(0, 120) || null,
      date_or_season: String(b.timeframe.label || '').slice(0, 120) || null,
      top_priorities: b.priorities.top3.slice(0, 3).map(priorityLabel),
      atmosphere_keywords: b.style.keywords.slice(0, 6),
      venue_vibes: b.location.venue_vibe_labels.slice(0, 4),
      values: b.values.slice(0, 5),
      deal_breakers: b.dealbreakers.slice(0, 3).map(function (id) { return DEAL_BREAKER_LABELS[id] || id; }),
      family_involvement: familyChoice ? familyChoice.label : null
    };
    try {
      localStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff));
      localStorage.removeItem(LEGACY_BRIEF_KEY);
      return true;
    } catch (err) {
      toast('This browser could not save the result for your account. You can still download the brief.');
      return false;
    }
  }
  function pairOf(res) {
    return res.animal.isHybrid ? [res.animal.primary, res.animal.secondary] : [res.animal.primary, res.animal.primary];
  }

  /* ---------- share payloads ---------- */
  function payload(kind) {
    var url, text, res, a;
    if (kind === 'partner') {
      a = animal(E.summariseSolo(S.me.answers).rank[0]);
      url = baseUrl() + E.partnerHash(S.me.answers);
      text = 'I just found out my wedding animal might be the ' + a.name + '. Your turn: take the 3-minute Wedding Animal Quiz, then we can unlock our couple result, see how aligned we are, and find out what we might disagree about.';
    } else if (kind === 'couple') {
      res = couple();
      url = baseUrl() + E.zooHash({ pair: pairOf(res), alignment: res.alignment });
      text = 'We are ' + res.animal.title + (res.alignment != null ? ' and ' + res.alignment + '% aligned' : '') +
        (res.friction[0] ? ', and we might disagree about ' + res.friction[0].title.toLowerCase() : '') + '. What is your wedding animal?';
    } else if (kind === 'friend') {
      url = baseUrl() + E.zooHash(S.zoo);
      text = 'I am a ' + animal(S.friend.animal.primary).name + ' at the wedding zoo. Which animal are you?';
    } else {
      res = couple();
      var f = res.friction[Number(kind.split(':')[1])];
      url = baseUrl();
      text = 'Settle this for us: "' + f.title + '". We cannot agree. Which side are you on? Then find your own wedding animal:';
    }
    return { text: text, url: url, title: 'The Wedding Animal Quiz' };
  }
  function shareRow(kind) {
    var p = payload(kind), msg = encodeURIComponent(p.text + ' ' + p.url);
    var native = navigator.share ? '<button type="button" class="btn btn-primary" data-action="share" data-kind="' + esc(kind) + '">Share…</button>' : '';
    return '<div class="qz-share">' + native +
      '<button type="button" class="btn btn-outline" data-action="copy" data-kind="' + esc(kind) + '">Copy link</button>' +
      '<a class="btn btn-outline" target="_blank" rel="noopener" href="https://wa.me/?text=' + msg + '">WhatsApp</a>' +
      '<a class="btn btn-outline" href="sms:?&body=' + msg + '">Text</a>' +
      '<a class="btn btn-outline" href="mailto:?subject=' + encodeURIComponent(p.title) + '&body=' + msg + '">Email</a></div>';
  }
  function doShare(kind, files) {
    var p = payload(kind), data = { title: p.title, text: p.text, url: p.url };
    if (files) data.files = files;
    if (navigator.share) {
      return navigator.share(data).catch(function (err) {
        if (err && err.name !== 'AbortError') toast('Sharing didn’t work here. Use Copy link instead.');
      });
    }
    return copyText(p.text + ' ' + p.url).then(function (ok) { toast(ok ? 'Link copied' : 'Copy the link from the address bar'); });
  }

  /* ---------- share card (canvas; never includes budget) ---------- */
  function loadImg(src) {
    return new Promise(function (resolve) {
      var im = new Image();
      im.onload = function () { resolve(im); };
      im.onerror = function () { resolve(null); };
      im.src = src;
    });
  }
  function wrap(ctx, text, x, y, maxW, lh) {
    var words = text.split(' '), line = '';
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = test;
    });
    ctx.fillText(line, x, y);
    return y + lh;
  }
  function drawCard(res) {
    var pair = pairOf(res), same = pair[0] === pair[1];
    return Promise.all(pair.slice(0, same ? 1 : 2).map(function (i) { return loadImg(photo(animal(i))); })).then(function (imgs) {
      var c = document.createElement('canvas'); c.width = 1080; c.height = 1350;
      var x = c.getContext('2d'), serif = '"Fraunces", Georgia, serif', sans = 'Inter, Arial, sans-serif';
      var g = x.createLinearGradient(0, 0, 0, 1350); g.addColorStop(0, '#F3DFE2'); g.addColorStop(0.45, '#FBF6EF'); g.addColorStop(1, '#F1E4C2');
      x.fillStyle = g; x.fillRect(0, 0, 1080, 1350);
      x.textAlign = 'center'; x.fillStyle = '#9A4F5D'; x.font = '700 26px ' + sans;
      x.fillText('T H E   W E D D I N G   A N I M A L   Q U I Z', 540, 96);
      var r = same ? 200 : 170, cx = same ? [540] : [400, 680];
      imgs.forEach(function (im, k) {
        x.save(); x.beginPath(); x.arc(cx[k], 340, r, 0, 6.2832); x.closePath(); x.fillStyle = '#fff'; x.fill();
        x.beginPath(); x.arc(cx[k], 340, r - 8, 0, 6.2832); x.closePath(); x.clip();
        if (im) { var s = Math.max((r * 2) / im.width, (r * 2) / im.height); x.drawImage(im, cx[k] - im.width * s / 2, 340 - im.height * s / 2, im.width * s, im.height * s); }
        x.restore();
      });
      x.fillStyle = '#2C241D'; x.font = '600 66px ' + serif;
      var y = wrap(x, res.animal.title, 540, 640, 900, 76);
      x.fillStyle = '#9A4F5D'; x.font = 'italic 44px ' + serif; x.fillText(res.animal.nickname, 540, y + 8);
      y += 70;
      if (res.alignment != null) { x.fillStyle = '#2C241D'; x.font = '700 92px ' + serif; x.fillText(res.alignment + '% aligned', 540, y + 70); y += 130; }
      x.fillStyle = '#6E6156'; x.font = '600 32px ' + sans;
      y = wrap(x, 'Our top 3: ' + res.priorities.map(priorityLabel).join('  ·  '), 540, y + 30, 900, 44);
      if (res.friction[0]) { x.fillStyle = '#9A6B10'; x.font = '600 32px ' + sans; y = wrap(x, 'We’ll argue about: ' + res.friction[0].title, 540, y + 14, 900, 44); }
      x.fillStyle = '#2C241D'; x.font = '700 36px ' + sans; x.fillText('What’s your wedding animal?', 540, 1226);
      x.fillStyle = '#6E6156'; x.font = '500 28px ' + sans; x.fillText('omnyid.com/wedding/animal-quiz.html  ·  budgets stay private', 540, 1280);
      return new Promise(function (resolve) { c.toBlob(resolve, 'image/png'); });
    });
  }
  function shareCard() {
    var res = couple();
    toast('Making your card…');
    (document.fonts && document.fonts.load ? document.fonts.load('600 40px Fraunces') : Promise.resolve()).catch(function () { return null; })
      .then(function () { return drawCard(res); }).then(function (blob) {
        if (!blob) { toast('Your browser couldn’t make the card. Use Copy link instead.'); return; }
        var file = new File([blob], 'our-wedding-animal.png', { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) return doShare('couple', [file]);
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'our-wedding-animal.png';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
        toast('Card saved. Post it anywhere.');
      });
  }

  /* ---------- stage rendering ---------- */
  function setStage(html, stage, keepScroll) {
    var y = window.scrollY;
    S.stage = stage;
    app.innerHTML = '<div class="quiz-stage"' + (keepScroll ? ' style="animation:none"' : '') + '>' + html + '</div>';
    if (keepScroll) { window.scrollTo(0, y); return; }
    var h = app.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    window.scrollTo({ top: Math.max(0, app.getBoundingClientRect().top + window.scrollY - 90), behavior: 'auto' });
  }

  function introView() {
    var banner = '', returning = S.me.done ? '<p class="qz-note" style="text-align:center;margin-top:14px">Welcome back. <button class="link-btn" data-action="resume">See your result</button> · <button class="link-btn" data-action="restart">Start over</button></p>' : '';
    var title = 'Which wedding animal are you two?', lede = '12 picture questions. 3 minutes. Find your wedding animal, your budget comfort zone, your venue vibe, your top three priorities, and the three things you’ll actually argue about.';
    if (S.partner) {
      banner = '<div class="qz-banner"><strong>' + esc(S.partner.name || 'Your partner') + '</strong> has already taken the quiz. Take it too to unlock your <strong>couple animal</strong>, alignment score and friction forecast.</div>';
      title = 'Your turn. What’s your wedding animal?';
    } else if (S.zoo) {
      var c = S.zoo, names = c.names.filter(Boolean).join(' & ') || 'A couple you know';
      banner = '<div class="qz-banner"><strong>' + esc(names) + '</strong> are <strong>The ' + animal(c.pair[0]).name + (c.pair[1] !== c.pair[0] ? ' × ' + animal(c.pair[1]).name : '') + ' Couple</strong>' +
        (c.alignment ? ' (' + c.alignment + '% aligned)' : '') + '. Which animal are you at their wedding?</div>';
      title = 'Which wedding guest animal are you?';
      lede = '12 quick picture questions. Find your animal, see how alike you and the couple are, and join their wedding zoo.';
    }
    var faces = D.ANIMALS.map(function (a) { return '<img src="' + photo(a) + '" alt="' + a.name + '" width="76" height="76" loading="lazy">'; }).join('');
    return banner + '<section class="qz-hero"><p class="eyebrow" style="justify-content:center">✦ The Wedding Animal Quiz</p><h1>' + esc(title) + '</h1><p class="lede">' + esc(lede) + '</p>' +
      '<div class="qz-zoo" aria-hidden="true">' + faces + '</div>' +
      '<div class="qz-promises"><span>About 3 minutes</span><span>Free, no email</span><span>Budget stays private</span></div>' +
      '<div class="qz-name"><label for="qzName">What should we call you? (optional)</label><input id="qzName" maxlength="14" autocomplete="given-name" value="' + esc(S.me.name) + '" placeholder="First name or nickname"></div>' +
      '<div class="hero-cta" style="justify-content:center"><button type="button" class="btn btn-primary btn-lg" data-action="start">Find my animal →</button></div>' + returning + '</section>';
  }

  function questionView() {
    var q = S.list[S.qi], total = S.list.length, isJoint = S.phase === 'joint';
    var answers = isJoint ? S.joint : S.me.answers, cur = answers[q.id];
    var part = isJoint ? 'Part B · Together · ' + (S.qi + 1) + ' of ' + total : 'Part A · Just you · ' + (S.qi + 1) + ' of ' + total;
    var body;
    if (q.kind === 'dual') {
      body = q.groups.map(function (g) {
        return '<div class="qz-group"><h3>' + esc(g.label) + '</h3><div class="qz-grid" role="group" aria-label="' + esc(g.label) + '">' +
          g.opts.map(function (o, i) { return tile(o, g.grid, cur && cur[g.id] === i, null, 'data-group="' + g.id + '"', i); }).join('') + '</div></div>';
      }).join('');
    } else {
      body = '<div class="qz-grid" role="group" aria-label="' + esc(q.title) + '">' + q.opts.map(function (o, i) {
        var rank = q.kind === 'top3' && cur ? cur.indexOf(i) + 1 : 0;
        return tile(o, q.grid, q.kind === 'top3' ? rank > 0 : cur === i, rank, '', i);
      }).join('') + '</div>';
    }
    var needsContinue = q.kind === 'top3' || q.kind === 'dual';
    var canContinue = q.kind === 'top3' ? (cur || []).length > 0 : q.kind === 'dual' ? !!(cur && cur.when != null && cur.where != null) : false;
    return '<div class="qz-top"><div class="qz-bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + total + '" aria-valuenow="' + S.qi + '"><i style="width:' + Math.round((S.qi / total) * 100) + '%"></i></div>' +
      '<span class="qz-count">' + Math.max(1, Math.round((total - S.qi) * 0.25)) + ' min left</span></div>' +
      '<div class="qz-q"><p class="qz-part">' + part + '</p>' + (q.spicy ? '<span class="qz-spicy">🌶 The Spicy Three</span>' : '') +
      '<h2>' + esc(q.title) + '</h2><p class="hint">' + esc(q.hint) + '</p>' + body + '</div>' +
      '<div class="qz-controls"><button type="button" class="btn btn-ghost" data-action="back"' + (S.qi === 0 ? ' disabled' : '') + '>← Back</button>' +
      '<button type="button" class="btn btn-ghost" data-action="skip">Skip this one</button>' +
      (needsContinue ? '<button type="button" class="btn btn-primary" data-action="next"' + (canContinue ? '' : ' disabled') + '>Continue →</button>' : '') + '</div>';
  }
  function tile(o, grid, picked, rank, extra, i) {
    var tick = '<span class="tick" aria-hidden="true">' + (rank || '✓') + '</span>';
    var common = 'type="button" data-opt="' + i + '" ' + extra + ' aria-pressed="' + (picked ? 'true' : 'false') + '"';
    if (grid === 'photo' && o.img) {
      return '<button ' + common + ' class="qz-tile photo' + (picked ? ' is-picked' : '') + '"><img src="' + IMG + o.img + '.webp" alt="" width="560" height="420" loading="lazy"><span class="cap">' + esc(o.label) + '</span>' + tick + '</button>';
    }
    return '<button ' + common + ' class="qz-tile icon' + (picked ? ' is-picked' : '') + '"><span class="em" aria-hidden="true">' + o.icon + '</span><span class="lbl">' + esc(o.label) + '</span>' +
      (o.sub ? '<span class="sub">' + esc(o.sub) + '</span>' : '') + tick + '</button>';
  }

  function chips(list, cls) { return '<div class="qz-chips">' + list.map(function (w) { return '<span class="qz-chip ' + (cls || '') + '">' + esc(w) + '</span>'; }).join('') + '</div>'; }

  function soloResultView() {
    var s = E.summariseSolo(S.me.answers), a = animal(s.rank[0]), b = animal(s.rank[1]);
    var topPrio = Object.keys(s.prio).sort(function (x, y) { return s.prio[y] - s.prio[x]; }).slice(0, 3).map(priorityLabel);
    var words = Object.keys(s.words).sort(function (x, y) { return s.words[y] - s.words[x]; }).slice(0, 5);
    var partner = S.partner ? S.partner.name || 'your partner' : 'your partner';
    return '<section class="qz-result-head"><div class="qz-crest"><img src="' + photo(a) + '" alt="' + a.name + '"></div>' +
      '<p class="qz-part" style="margin-top:16px">Your wedding animal</p><h1>You’re a ' + a.name + ' ' + a.emoji + '</h1>' +
      '<p class="qz-nick">with a streak of ' + b.name + '</p><p class="qz-line">' + esc(a.line) + '</p></section>' +
      '<div class="qz-cards"><div class="qz-panel"><h3>Your top priorities</h3><ol class="qz-rank">' + topPrio.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="qz-panel"><h3>Your style in five words</h3>' + chips(words, 'rose') + '</div></div>' +
      '<div class="qz-panel qz-lock"><div class="blur" aria-hidden="true"><h3>Your couple animal, alignment score and friction forecast</h3><p class="qz-big">The ??? × ??? Couple · 8?% aligned</p><p>You’ll likely disagree about ???, ??? and ???.</p></div>' +
      '<div class="over"><h3>Locked until ' + esc(partner) + ' takes the quiz</h3><p class="qz-note">Send it over. It takes them 3 minutes. Their answers and yours stay between you.</p></div></div>' +
      '<div class="qz-section"><h2>Send it to ' + esc(partner) + '</h2><p class="qz-note" style="text-align:center">The link carries your answers (not your name or email) so your partner can unlock the couple result. Send it to them only.</p>' + shareRow('partner') + '</div>' +
      '<div class="qz-panel" style="text-align:center;margin-top:18px"><h3>Can’t wait?</h3><p>Answer the six couple questions yourself now and start your wedding brief. Alignment unlocks once your partner joins.</p>' +
      '<button type="button" class="btn btn-outline" data-action="joint">Start our brief now</button> <button type="button" class="btn btn-ghost" data-action="restart">Retake the quiz</button></div>' + creditsHtml();
  }

  function jointIntroView() {
    return '<section class="qz-hero"><p class="qz-part">Part B · Together</p><h1>Now answer six together</h1><p class="lede">Hand the phone over, or sit side by side. These six questions turn your results into a real planning brief: budget, guests, top three priorities, family, dealbreakers, and when and where.</p>' +
      '<div class="hero-cta" style="justify-content:center"><button type="button" class="btn btn-primary btn-lg" data-action="start-joint">Let’s go →</button></div></section>';
  }

  function coupleView() {
    var res = couple(), b = res.brief, pair = pairOf(res), partnerDone = !!S.partner;
    publishBrief(res);
    var crest = '<div class="qz-crest">' + (pair[0] === pair[1] ? '<img src="' + photo(animal(pair[0])) + '" alt="' + animal(pair[0]).name + '">' :
      '<img src="' + photo(animal(pair[0])) + '" alt="' + animal(pair[0]).name + '"><img src="' + photo(animal(pair[1])) + '" alt="' + animal(pair[1]).name + '">') + '</div>';
    var ring = res.alignment != null ? '<div class="qz-ring" style="--pct:' + res.alignment + '" role="img" aria-label="' + res.alignment + ' percent aligned"><span>' + res.alignment + '%</span></div><p class="qz-ring-cap">aligned</p>' : '';
    var head = '<section class="qz-result-head">' + crest + '<p class="qz-part" style="margin-top:16px">' + (partnerDone ? 'Your couple result' : 'Your wedding brief') + '</p><h1>' + esc(partnerDone ? res.animal.title : 'You’re a ' + animal(res.animal.primary).name + ' ' + animal(res.animal.primary).emoji) + '</h1>' +
      (partnerDone ? '<p class="qz-nick">' + esc(res.animal.nickname) + '</p>' : '') + '<p class="qz-line">' + esc(animal(res.animal.primary).line) + ' ' + esc(animal(res.animal.secondary).line) + '</p>' + ring + '</section>';
    var shareTop = partnerDone ? '<div class="qz-panel" style="text-align:center"><h3>Show them your animal</h3><p class="qz-note">A share card with your hybrid, alignment and top three. No budget, ever.</p>' +
      '<div class="qz-share"><button type="button" class="btn btn-primary" data-action="card">Share my card</button></div>' + shareRow('couple') + '</div>' :
      '<div class="qz-panel qz-lock"><div class="blur" aria-hidden="true"><h3>Alignment and friction forecast</h3><p class="qz-big">???% aligned</p></div><div class="over"><h3>Alignment unlocks when ' + esc(S.partner ? S.partner.name : 'your partner') + ' takes the quiz</h3>' + shareRow('partner') + '</div></div>';

    var comfort = b.budget.comfort ? '<p class="qz-big">' + esc(b.budget.comfort.label) + '</p><p>Comfort zone' + (b.budget.stretch && b.budget.stretch.id !== b.budget.comfort.id ? '. Stretch: ' + esc(b.budget.stretch.label) : '') + '.</p>' : '<p class="qz-big">Not set yet</p>';
    var cards = '<div class="qz-cards">' +
      '<div class="qz-panel"><h3>Budget comfort</h3>' + comfort + '<p>Spend first on: <strong>' + esc(b.priorities.splurge.map(priorityLabel).join(', ')) + '</strong></p>' +
      (b.priorities.save.length ? '<p>Easy to save on: ' + esc(b.priorities.save.map(priorityLabel).join(', ')) + '</p>' : '') + '<p class="qz-note">Private to you two. It is not in your share links or cards.</p></div>' +
      '<div class="qz-panel"><h3>Guest count</h3><p class="qz-big">' + (b.guests.range ? b.guests.range.min + ' – ' + b.guests.range.max + ' guests' : 'Not set yet') + '</p></div>' +
      '<div class="qz-panel"><h3>Venue vibe shortlist</h3><ol class="qz-rank">' + b.location.venue_vibe_labels.map(function (v) { return '<li>' + esc(v) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="qz-panel"><h3>Style and feel</h3>' + chips(b.style.keywords.map(cap), 'rose') + '</div>' +
      '<div class="qz-panel"><h3>Top three priorities</h3><ol class="qz-rank">' + b.priorities.top3.map(function (p) { return '<li>' + esc(priorityLabel(p)) + '</li>'; }).join('') + '</ol></div>' +
      '<div class="qz-panel"><h3>Values and dealbreakers</h3>' + chips(b.values.map(function (v) { return cap(v.replace(/-/g, ' ')); })) +
      (b.dealbreakers.length ? '<p style="margin-top:10px">Protect at all costs: <strong>' + esc(D.DEALBREAKERS[b.dealbreakers[0]]) + '</strong></p>' : '') + '</div>' +
      '<div class="qz-panel"><h3>Where and when</h3><p class="qz-big">' + esc(b.location.region_label || 'Region open') + '</p><p>' + esc(b.timeframe.label || 'Date open') + '</p></div></div>';

    var fr = '';
    if (partnerDone) {
      fr = '<div class="qz-section"><h2>Your friction forecast</h2><p class="qz-note">Different instincts, not red flags. Try each 20-minute conversation before you book anything.</p><div class="qz-fric">' +
        (res.friction.length ? res.friction.map(function (f, i) {
          return '<article><h4>' + esc(f.title) + '</h4><p>' + esc(f.detail) + '</p><p class="try"><strong>Try this:</strong> ' + esc(f.prompt) + '</p>' +
            '<button type="button" class="btn btn-ghost" data-action="share" data-kind="poll:' + i + '">Settle it in the group chat</button></article>';
        }).join('') : '<article><h4>No friction detected</h4><p>You answered almost everything alike. Suspiciously smooth. Check you’re both telling the truth.</p></article>') + '</div></div>';
    }
    var steps = '<div class="qz-section"><h2>Your next three decisions</h2><ol class="qz-steps">' + b.next_decisions.map(function (d) { return '<li><strong>' + esc(d.title) + '.</strong> ' + esc(d.detail) + '</li>'; }).join('') + '</ol></div>';
    var zoo = '<div class="qz-section"><div class="qz-panel" style="text-align:center"><h3>Start your wedding zoo 🦚🦉🦦</h3><p>Send this to your wedding party and closest friends. They find their own animal, see how alike you are, and join your zoo. Their budgets are never asked, and yours never leave.</p>' + shareRow('couple') + '</div></div>';
    var cta = '<div class="qz-cta-band"><h2>Turn this into your wedding plan</h2><p>Choose the first option and this browser will hold a minimal result for up to 30 days: budget band, guest range, general location or season, style and priorities. Raw answers and names are not imported.</p>' +
      '<a class="btn btn-primary btn-lg" data-action="account-with-brief" href="../workspace/?auth=register&amp;source=wedding_quiz">Create account with this result</a>' +
      '<p class="qz-note" style="margin-top:12px"><a href="../workspace/?auth=register&amp;source=wedding">Create an account without importing it</a></p>' +
      '<p style="margin-top:14px"><button type="button" class="btn btn-ghost" data-action="copy-brief">Copy brief (JSON)</button> <button type="button" class="btn btn-ghost" data-action="download-brief">Download brief</button> <a class="btn btn-ghost" href="' + plannerMailto(res) + '">Email to my planner</a> <button type="button" class="btn btn-ghost" data-action="restart">Retake</button></p></div>';
    return head + shareTop + cards + fr + steps + zoo + cta + creditsHtml();
  }

  function plannerMailto(res) {
    var b = res.brief, lines = ['Our wedding brief (The Wedding Animal Quiz)', '', res.animal.title + ': ' + res.animal.nickname,
      'Budget comfort: ' + (b.budget.comfort ? b.budget.comfort.label : 'not set'), 'Guests: ' + (b.guests.range ? b.guests.range.min + '-' + b.guests.range.max : 'not set'),
      'Where and when: ' + (b.location.region_label || 'open') + ', ' + (b.timeframe.label || 'date open'), 'Venue vibes: ' + b.location.venue_vibe_labels.join('; '),
      'Style: ' + b.style.keywords.join(', '), 'Top three: ' + b.priorities.top3.map(priorityLabel).join(', ')];
    return 'mailto:?subject=' + encodeURIComponent('Our wedding brief') + '&body=' + encodeURIComponent(lines.join('\n'));
  }

  function friendView() {
    var f = S.friend, a = animal(f.animal.primary), z = S.zoo;
    var members = z.members.concat([{ animal: f.animal.primary, name: S.me.name || 'You' }]);
    var names = z.names.filter(Boolean).join(' & ') || 'the couple';
    var cards = '<div class="qz-member"><img src="' + photo(animal(z.pair[0])) + '" alt=""><b>' + esc(names) + '</b><span>The couple</span></div>' + members.map(function (m) {
      return '<div class="qz-member"><img src="' + photo(animal(m.animal)) + '" alt=""><b>' + esc(m.name || animal(m.animal).name) + '</b><span>' + animal(m.animal).name + '</span></div>';
    }).join('');
    return '<section class="qz-result-head"><div class="qz-crest"><img src="' + photo(a) + '" alt="' + a.name + '"></div><p class="qz-part" style="margin-top:16px">Your wedding guest animal</p>' +
      '<h1>You’re a ' + a.name + ' ' + a.emoji + '</h1><p class="qz-nick">' + esc(a.guest) + '</p><div class="qz-ring" style="--pct:' + f.likeness + '"><span>' + f.likeness + '%</span></div>' +
      '<p class="qz-ring-cap">alike to ' + esc(names) + '</p></section>' +
      '<div class="qz-section"><h2>' + esc(names) + '’s wedding zoo</h2><div class="qz-members">' + cards + '</div></div>' +
      '<div class="qz-section"><div class="qz-panel" style="text-align:center"><h3>Pass it on</h3><p>Add yourself to the zoo and send it to the next guest.</p>' + shareRow('friend') + '</div></div>' +
      '<div class="qz-cta-band"><h2>Planning your own wedding?</h2><p>Take the quiz as a couple and get your animal, your alignment and a planning brief you can actually use.</p><a class="btn btn-primary btn-lg" href="animal-quiz.html">Take it as a couple</a></div>' + creditsHtml();
  }

  function creditsHtml() {
    var rows = Object.keys(D.CREDITS).map(function (k) {
      var c = D.CREDITS[k];
      var url = /^https:\/\/[a-z0-9.-]+(?:\/|$)/i.test(String(c[2] || '')) ? c[2] : '#';
      return '<li>' + esc(c[1]) + ', <a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(c[0]) + '</a> (' + esc(c[3]) + ')</li>';
    }).join('');
    return '<details class="qz-credits qz-section"><summary>Photo credits</summary><ul>' + rows + '</ul></details>';
  }

  /* ---------- flow ---------- */
  function startSolo() {
    var input = document.getElementById('qzName');
    if (input) S.me.name = E.cleanName(input.value);
    S.list = D.SOLO; S.phase = 'solo'; S.qi = 0;
    S.me.answers = {}; S.me.done = false; S.joint = {}; S.jointDone = false;
    render('q');
  }
  function startJoint() { S.list = D.JOINT; S.phase = 'joint'; S.qi = 0; S.joint = {}; render('q'); }
  function render(stage, keepScroll) {
    var views = { intro: introView, q: questionView, soloResult: soloResultView, jointIntro: jointIntroView, result: coupleView, friend: friendView };
    setStage(views[stage](), stage, keepScroll);
    if (!S.zoo) store(true);
  }
  function advance() {
    clearTimeout(advanceTimer);
    if (S.qi + 1 < S.list.length) { S.qi++; render('q'); return; }
    if (S.phase === 'joint') { S.jointDone = true; render('result'); return; }
    S.me.done = true;
    if (S.zoo) { S.friend = E.friendResult(S.me.answers, S.zoo.pair); render('friend'); return; }
    if (S.partner) { render('jointIntro'); return; }
    render('soloResult');
  }
  function answerFor() { return S.phase === 'joint' ? S.joint : S.me.answers; }

  function onTile(btn) {
    var q = S.list[S.qi], answers = answerFor(), i = Number(btn.getAttribute('data-opt'));
    if (q.kind === 'top3') {
      var picks = (answers[q.id] || []).slice(), at = picks.indexOf(i);
      if (at >= 0) picks.splice(at, 1); else if (picks.length < 3) picks.push(i);
      answers[q.id] = picks;
      render('q', true);
      if (picks.length === 3) advanceTimer = setTimeout(advance, 450);
      return;
    }
    if (q.kind === 'dual') {
      var cur = answers[q.id] || {};
      cur[btn.getAttribute('data-group')] = i; answers[q.id] = cur;
      render('q', true);
      if (cur.when != null && cur.where != null) advanceTimer = setTimeout(advance, 450);
      return;
    }
    answers[q.id] = i;
    app.querySelectorAll('.qz-tile').forEach(function (t) {
      var on = t === btn; t.classList.toggle('is-picked', on); t.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    advanceTimer = setTimeout(advance, 260);
  }

  function briefJson() { return JSON.stringify(couple().brief, null, 2); }

  app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action], .qz-tile');
    if (!t || !app.contains(t)) return;
    if (t.classList.contains('qz-tile')) { onTile(t); return; }
    var act = t.getAttribute('data-action'), kind = t.getAttribute('data-kind');
    if (act === 'start') startSolo();
    else if (act === 'back') { clearTimeout(advanceTimer); if (S.qi > 0) { S.qi--; render('q'); } }
    else if (act === 'skip') { var q = S.list[S.qi]; delete answerFor()[q.id]; advance(); }
    else if (act === 'next') advance();
    else if (act === 'joint') render('jointIntro');
    else if (act === 'start-joint') startJoint();
    else if (act === 'resume') render(S.jointDone ? 'result' : S.partner ? 'jointIntro' : 'soloResult');
    else if (act === 'restart') { clearStore(); S.me = { name: S.me.name, answers: {}, done: false }; S.partner = null; S.joint = {}; S.jointDone = false; render('intro'); }
    else if (act === 'share') doShare(kind);
    else if (act === 'copy') { var p = payload(kind); copyText(p.text + ' ' + p.url).then(function (ok) { toast(ok ? 'Link copied. Paste it anywhere.' : 'Copy the link from your address bar'); }); }
    else if (act === 'card') shareCard();
    else if (act === 'copy-brief') copyText(briefJson()).then(function (ok) { toast(ok ? 'Brief copied' : 'Could not copy. Use Download instead.'); });
    else if (act === 'download-brief') {
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([briefJson()], { type: 'application/json' })); a.download = 'wedding-brief.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }
    else if (act === 'account-with-brief' && !writeProfileHandoff(couple())) e.preventDefault();
  });

  /* ---------- boot ---------- */
  function boot() {
    var info = E.parseHash(location.hash), saved = store(false);
    if (info && info.kind === 'p') {
      S.partner = { answers: info.answers, name: info.name };
    } else if (info && info.kind === 'z') {
      S.zoo = info;
    } else if (saved) {
      var safeMe = saved.me && typeof saved.me === 'object' && !Array.isArray(saved.me) ? saved.me : {};
      var safePartner = saved.partner && typeof saved.partner === 'object' && !Array.isArray(saved.partner) ? saved.partner : null;
      S.me = { name: E.cleanName(safeMe.name), answers: safeMe.answers && typeof safeMe.answers === 'object' ? safeMe.answers : {}, done: safeMe.done === true };
      S.partner = safePartner ? { name: E.cleanName(safePartner.name), answers: safePartner.answers && typeof safePartner.answers === 'object' ? safePartner.answers : {} } : null;
      S.joint = saved.joint && typeof saved.joint === 'object' && !Array.isArray(saved.joint) ? saved.joint : {};
      S.jointDone = saved.jointDone === true;
    }
    if (info) history.replaceState(null, '', location.pathname + location.search);
    if (info && info.kind === 'p') S.me.name = saved && saved.me ? saved.me.name || '' : '';
    render('intro');
  }

  var toastEl = document.createElement('div');
  toastEl.id = 'qzToast'; toastEl.className = 'qz-toast'; toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);
  boot();
})();
