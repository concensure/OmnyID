// The Wedding Animal Quiz — scoring, share-link codec and couple-brief builder. No DOM access.
(function (root) {
  'use strict';

  var D = root.OmnyQuizData || (typeof require !== 'undefined' ? require('./quiz-data.js') : null);
  var CODE_VERSION = '1';
  var DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
  var RANK_WEIGHTS = [1, 0.7, 0.5];
  var BRIEF_SCHEMA = 'omnyid.wedding.couple_brief';
  var NOMINAL = ['frame', 'venue', 'feel', 'elope', 'bar', 'kids', 'firstlook'];
  var ORDINAL = ['guests', 'budget'];

  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function optOf(question, idx) { return idx == null ? null : question.opts[idx] || null; }
  function soloOpt(answers, qid) { return optOf(byId(D.SOLO, qid), answers[qid]); }
  function cleanName(raw) { return String(raw || '').replace(/[^A-Za-z0-9 '\-]/g, '').trim().slice(0, 14); }

  /* ---------- share-link codec: answers live in the URL hash, never on a server ---------- */
  function encodeSolo(answers) {
    var out = '';
    D.SOLO.forEach(function (q) {
      if (q.kind === 'top3') {
        var picks = answers[q.id] || [];
        for (var i = 0; i < 3; i++) out += picks[i] == null ? '_' : DIGITS[picks[i]];
      } else {
        out += answers[q.id] == null ? '_' : DIGITS[answers[q.id]];
      }
    });
    return CODE_VERSION + out;
  }
  function decodeSolo(code) {
    if (!code || code.charAt(0) !== CODE_VERSION) return null;
    var body = code.slice(1), pos = 0, answers = {};
    for (var n = 0; n < D.SOLO.length; n++) {
      var q = D.SOLO[n], read = function () {
        var ch = body.charAt(pos++), v = DIGITS.indexOf(ch);
        return ch === '_' || v < 0 || v >= q.opts.length ? null : v;
      };
      if (q.kind === 'top3') {
        var picks = [read(), read(), read()].filter(function (v, i, a) { return v != null && a.indexOf(v) === i; });
        answers[q.id] = picks;
      } else {
        answers[q.id] = read();
      }
    }
    return pos === body.length ? answers : null;
  }
  /* Share links deliberately omit names, budget, contact details and the full planning brief. */
  function partnerHash(answers) { return '#p=' + encodeSolo(answers); }
  function parseHash(hash) {
    if (!hash || hash.length > 512) return null;
    var m = /^#([pz])=(.+)$/.exec(hash || '');
    if (!m) return null;
    var parts = m[2].split('.');
    if (m[1] === 'p') {
      var answers = decodeSolo(parts[0]);
      return answers ? { kind: 'p', answers: answers, name: '' } : null;
    }
    if (parts[0] !== CODE_VERSION || !/^\d\d$/.test(parts[1] || '')) return null;
    var pairA = Number(parts[1].charAt(0)), pairB = Number(parts[1].charAt(1));
    if (pairA < 0 || pairA >= D.ANIMALS.length || pairB < 0 || pairB >= D.ANIMALS.length) return null;
    return { kind: 'z', pair: [Number(parts[1].charAt(0)), Number(parts[1].charAt(1))], alignment: Number(parts[2]) || null,
      names: ['', ''], members: [] };
  }
  function zooHash(couple) {
    var pair = couple.pair.join('');
    var pct = couple.alignment == null ? '' : couple.alignment;
    return '#z=' + CODE_VERSION + '.' + pair + '.' + pct;
  }

  /* ---------- scoring ---------- */
  function addAnimals(vec, pair, weight) {
    if (!pair) return;
    vec[pair[0]] += 2 * weight;
    vec[pair[1]] += 1 * weight;
  }
  function normalise(vec) {
    var sum = vec.reduce(function (a, b) { return a + b; }, 0) || 1;
    return vec.map(function (v) { return v / sum; });
  }
  function ranking(vec) {
    return vec.map(function (v, i) { return i; }).sort(function (a, b) { return vec[b] - vec[a] || a - b; });
  }
  function bump(map, key, w) { map[key] = (map[key] || 0) + w; }
  function topKeys(map, n) {
    return Object.keys(map).sort(function (a, b) { return map[b] - map[a] || (a < b ? -1 : 1); }).slice(0, n);
  }

  function summariseSolo(answers) {
    var raw = D.ANIMALS.map(function () { return 0; }), prio = {}, venues = {}, words = {};
    D.SOLO.forEach(function (q) {
      if (q.kind === 'top3') {
        (answers[q.id] || []).forEach(function (idx, rank) {
          var p = q.opts[idx];
          addAnimals(raw, p.a, RANK_WEIGHTS[rank]);
          bump(prio, p.id, 3 - rank);
        });
        return;
      }
      var o = optOf(q, answers[q.id]);
      if (!o) return;
      addAnimals(raw, o.a, 1);
      if (o.p) Object.keys(o.p).forEach(function (k) { bump(prio, k, o.p[k]); });
      (o.v || []).forEach(function (v) { bump(venues, v, q.id === 'venue' ? 2 : 1); });
      (o.s || []).forEach(function (w) { bump(words, w, 1); });
    });
    var vec = normalise(raw), rank = ranking(vec);
    D.ANIMALS[rank[0]].venues.forEach(function (v) { bump(venues, v, 0.5); });
    D.ANIMALS[rank[0]].words.forEach(function (w) { bump(words, w, 0.5); });
    var feel = soloOpt(answers, 'feel'), dress = soloOpt(answers, 'dress'), venue = soloOpt(answers, 'venue');
    var elope = soloOpt(answers, 'elope'), budget = soloOpt(answers, 'budget'), guests = soloOpt(answers, 'guests');
    return {
      answers: answers, vec: vec, rank: rank, prio: prio, venues: venues, words: words,
      formality: dress ? dress.formality : null, energy: feel ? feel.energy : null,
      scope: venue ? venue.scope : null, elopeTag: elope ? elope.tag : null,
      budgetIdx: answers.budget, guestsIdx: answers.guests, budgetBand: budget, guestBand: guests
    };
  }

  function cosine(a, b) {
    var dot = 0, na = 0, nb = 0;
    for (var i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
    return na && nb ? dot / Math.sqrt(na * nb) : 0;
  }
  function top3Of(prio) { return topKeys(prio, 3); }

  function hybridFor(vec) {
    var rank = ranking(vec), a = rank[0], b = rank[1];
    var isHybrid = vec[b] >= 0.75 * vec[a];
    var lo = Math.min(a, b), hi = Math.max(a, b);
    var first = D.ANIMALS[a], second = D.ANIMALS[b];
    return {
      primary: a, secondary: b, isHybrid: isHybrid,
      nickname: isHybrid ? D.HYBRIDS[lo + '-' + hi] : 'Through and Through',
      title: isHybrid ? 'The ' + first.name + ' × ' + second.name + ' Couple' : 'The ' + first.name + ' Couple'
    };
  }

  function alignment(sa, sb) {
    var cos = cosine(sa.vec, sb.vec);
    var ta = top3Of(sa.prio), tb = top3Of(sb.prio);
    var overlap = ta.filter(function (id) { return tb.indexOf(id) >= 0; }).length / 3;
    var total = 0, count = 0;
    NOMINAL.forEach(function (id) {
      var x = sa.answers[id], y = sb.answers[id];
      if (x == null || y == null) return;
      total += x === y ? 1 : 0; count++;
    });
    ORDINAL.forEach(function (id) {
      var x = sa.answers[id], y = sb.answers[id];
      if (x == null || y == null) return;
      total += 1 - Math.abs(x - y) / (byId(D.SOLO, id).opts.length - 1); count++;
    });
    if (sa.formality != null && sb.formality != null) { total += 1 - Math.abs(sa.formality - sb.formality) / 4; count++; }
    var match = count ? total / count : cos;
    return Math.round(100 * (0.4 * cos + 0.3 * overlap + 0.3 * match));
  }

  /* ---------- friction forecast ---------- */
  var FRICTION = [
    { id: 'guests', title: 'Guest list size', kind: 'ordinal', prompt: 'Each write down the 10 people who absolutely must be there, then compare lists before you compare numbers.' },
    { id: 'budget', title: 'Budget comfort', kind: 'ordinal', prompt: 'Share the number you would feel relaxed spending and the number that would make you wince, then plan between the two.' },
    { id: 'bar', title: 'The bar', kind: 'nominal', prompt: 'List what each of you is really worried about: cost, behaviour or atmosphere. A limited bar often answers all three.' },
    { id: 'kids', title: 'Kids at the wedding', kind: 'nominal', prompt: 'Name the children who are definitely invited (nieces, nephews, cousins) before you argue about the rule.' },
    { id: 'firstlook', title: 'First look', kind: 'nominal', prompt: 'Ask your photographer to sketch both timelines, then pick the one that protects the moment you each care about.' },
    { id: 'dress', title: 'Dress code', kind: 'ordinal2', prompt: 'Pick one outfit photo you both love and use it as the dress-code reference on the invitation.' },
    { id: 'venue', title: 'Venue vibe', kind: 'venue', prompt: 'Each pick your top three venues on a map. Look for overlap in region first, style second.' },
    { id: 'elope', title: 'Big wedding or small', kind: 'elope', prompt: 'Name the one thing a big wedding gives you and the one thing eloping would cost you. Compare answers.' },
    { id: 'priorities', title: 'Where the money goes', kind: 'priorities', prompt: 'Rank where the first extra $1,000 would go. That is your tie-breaker for every later decision.' }
  ];

  function frictionForecast(sa, sb, names) {
    var out = [];
    FRICTION.forEach(function (f) {
      var q = byId(D.SOLO, f.id), x = sa.answers[f.id], y = sb.answers[f.id], severity = 0, detail = '';
      var la = q && optOf(q, x), lb = q && optOf(q, y);
      if (f.kind === 'ordinal' && x != null && y != null) severity = Math.abs(x - y);
      else if (f.kind === 'ordinal2' && sa.formality != null && sb.formality != null) {
        var gap = Math.abs(sa.formality - sb.formality);
        severity = gap >= 2 ? gap - 1 : 0;
      }
      else if (f.kind === 'nominal' && x != null && y != null) severity = x === y ? 0 : 1;
      else if (f.kind === 'venue' && x != null && y != null) severity = sa.scope && sb.scope && sa.scope !== sb.scope ? 2 : (x === y ? 0 : 0.5);
      else if (f.kind === 'elope' && x != null && y != null) severity = (sa.elopeTag === 'privacy') !== (sb.elopeTag === 'privacy') ? 2 : 0;
      else if (f.kind === 'priorities') {
        var ta = top3Of(sa.prio), tb = top3Of(sb.prio);
        var shared = ta.filter(function (id) { return tb.indexOf(id) >= 0; }).length;
        severity = shared === 0 ? 2 : (shared === 1 ? 0.5 : 0);
        la = { label: ta.map(function (id) { return byId(D.PRIORITIES, id).label; }).join(', ') };
        lb = { label: tb.map(function (id) { return byId(D.PRIORITIES, id).label; }).join(', ') };
      }
      if (severity > 0 && la && lb) {
        detail = names[0] + ': “' + la.label + '”. ' + names[1] + ': “' + lb.label + '”.';
        out.push({ id: f.id, title: f.title, severity: severity, detail: detail, prompt: f.prompt });
      }
    });
    out.sort(function (a, b) { return b.severity - a.severity; });
    return out.slice(0, 3);
  }

  /* ---------- couple result and brief ---------- */
  function bandBounds(list, idxA, idxB, idxJoint) {
    var idx = [idxA, idxB].filter(function (v) { return v != null; });
    if (idxJoint != null) {
      return { agreed: list[idxJoint], comfort: list[idxJoint], stretch: list[Math.max.apply(null, idx.concat([idxJoint]))] };
    }
    if (!idx.length) return null;
    return { agreed: null, comfort: list[Math.min.apply(null, idx)], stretch: list[Math.max.apply(null, idx)] };
  }

  function jointPick(joint, qid) {
    var q = byId(D.JOINT, qid);
    return joint && q && joint[qid] != null ? q.opts[joint[qid]] : null;
  }

  function rankedPriorities(sa, sb, joint) {
    var picks = joint && joint.priorities && joint.priorities.length ? joint.priorities : null;
    if (picks) return picks.map(function (i) { return D.PRIORITIES[i].id; });
    var merged = {};
    [sa, sb].forEach(function (s) { if (s) Object.keys(s.prio).forEach(function (k) { bump(merged, k, s.prio[k]); }); });
    return topKeys(merged, 3);
  }

  function valuesOf(summaries, joint, ranked, budget) {
    var w = {};
    var family = jointPick(joint, 'family'), deal = jointPick(joint, 'dealbreaker');
    summaries.forEach(function (s) {
      if (s.elopeTag === 'privacy') { bump(w, 'privacy-minded', 2); bump(w, 'debt-averse', 1); }
      if (s.elopeTag === 'family') bump(w, 'family-first', 2);
      if (s.elopeTag === 'tradition') bump(w, 'tradition-minded', 2);
      if (s.elopeTag === 'celebration') bump(w, 'celebration-led', 2);
      if (s.guestsIdx === 0) bump(w, 'privacy-minded', 1);
      if (s.budgetIdx === 0) bump(w, 'debt-averse', 1);
    });
    if (family && (family.id === 'traditional' || family.id === 'cohost')) bump(w, 'family-first', 3);
    if (family && family.id === 'independent') bump(w, 'independent', 3);
    if (deal && deal.id === 'debt') bump(w, 'debt-averse', 4);
    if (deal && deal.id === 'conflict') bump(w, 'family-first', 2);
    if (deal && deal.id === 'generic') bump(w, 'design-led', 3);
    ranked.forEach(function (id) {
      if (id === 'design' || id === 'attire' || id === 'photos') bump(w, 'design-led', 1.5);
      if (id === 'music' || id === 'food') bump(w, 'celebration-led', 1.5);
      if (id === 'people') bump(w, 'family-first', 1.5);
      if (id === 'sustainability') bump(w, 'sustainability-minded', 4);
      if (id === 'convenience') bump(w, 'low-stress', 2);
    });
    if (budget && budget.comfort && budget.comfort.min === 0) bump(w, 'debt-averse', 1);
    return topKeys(w, 4);
  }

  function nextDecisions(brief) {
    var top = brief.priorities.top3[0] ? byId(D.PRIORITIES, brief.priorities.top3[0]).label.toLowerCase() : 'your top priority';
    var venue = brief.location.venue_vibe_labels[0] || 'your favourite venue style';
    var region = brief.location.region_label || 'your area';
    var guests = brief.guests.range ? brief.guests.range.min + '–' + brief.guests.range.max + ' guests' : 'your guest range';
    var list = [
      { id: 'lock_budget', title: 'Lock the total and the split',
        detail: brief.budget.comfort ? 'Plan around ' + brief.budget.comfort.label + ' and give ' + top + ' the first slice.' : 'Agree one total number, then give ' + top + ' the first slice.' },
      { id: 'shortlist_venues', title: 'Shortlist three venues',
        detail: venue + ' in ' + region + ' that fit ' + guests + '. ' + (brief.timeframe.label ? 'Ask each about ' + brief.timeframe.label.toLowerCase() + '.' : 'Ask each about weekday and off-peak dates.') }
    ];
    var f = brief.friction[0];
    list.push(f ? { id: 'friction_chat', title: 'Have the ' + f.title.toLowerCase() + ' conversation', detail: f.prompt }
      : { id: 'pick_dates', title: 'Pick two or three date windows', detail: 'Venue availability decides everything else, so choose windows before you choose vendors.' });
    return list;
  }

  function buildCouple(input) {
    var names = [cleanName(input.names && input.names[0]) || 'You', cleanName(input.names && input.names[1]) || 'Your partner'];
    var sa = summariseSolo(input.a), sb = input.b ? summariseSolo(input.b) : null, joint = input.joint || null;
    var vec = sb ? normalise(sa.vec.map(function (v, i) { return v + sb.vec[i]; })) : sa.vec;
    var animal = hybridFor(vec);
    var summaries = sb ? [sa, sb] : [sa];
    var pct = sb ? alignment(sa, sb) : null;
    var friction = sb ? frictionForecast(sa, sb, names) : [];
    var ranked = rankedPriorities(sa, sb, joint);

    var bBand = bandBounds(D.BUDGET_BANDS, sa.budgetIdx, sb ? sb.budgetIdx : null, joint ? joint.budget : null);
    var gBand = bandBounds(D.GUEST_BANDS, sa.guestsIdx, sb ? sb.guestsIdx : null, joint ? joint.guests : null);
    var venues = {}, words = {}, formality = [], energy = [], scopes = [];
    summaries.forEach(function (s) {
      Object.keys(s.venues).forEach(function (k) { bump(venues, k, s.venues[k]); });
      Object.keys(s.words).forEach(function (k) { bump(words, k, s.words[k]); });
      if (s.formality != null) formality.push(s.formality);
      if (s.energy != null) energy.push(s.energy);
      if (s.scope) scopes.push(s.scope);
    });
    var whenPick = joint && joint.whenwhere ? byId(D.JOINT, 'whenwhere').groups[0].opts[joint.whenwhere.when] : null;
    var wherePick = joint && joint.whenwhere ? byId(D.JOINT, 'whenwhere').groups[1].opts[joint.whenwhere.where] : null;
    var family = jointPick(joint, 'family'), deal = jointPick(joint, 'dealbreaker');
    var avg = function (arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : null; };
    var splurge = ranked.slice(0, 3);
    var save = D.PRIORITIES.map(function (p) { return p.id; }).filter(function (id) { return ranked.indexOf(id) < 0 && !summaries.some(function (s) { return s.prio[id]; }); }).slice(0, 3);
    var venueTags = topKeys(venues, 3);

    var brief = {
      schema: BRIEF_SCHEMA, version: 1, source: 'wedding_animal_quiz', created_at: new Date().toISOString(), locale: 'en-AU',
      completeness: { partner_a: true, partner_b: !!sb, joint: !!(joint && Object.keys(joint).length) },
      couple: {
        nicknames: names, alignment_pct: pct,
        animal: { primary: D.ANIMALS[animal.primary].id, secondary: D.ANIMALS[animal.secondary].id, is_hybrid: animal.isHybrid, title: animal.title, nickname: animal.nickname },
        partner_animals: summaries.map(function (s) { return D.ANIMALS[s.rank[0]].id; })
      },
      budget: {
        currency: 'AUD', visibility: 'private',
        agreed: bBand && bBand.agreed ? { id: bBand.agreed.id, min: bBand.agreed.min, max: bBand.agreed.max, label: bBand.agreed.label } : null,
        comfort: bBand ? { id: bBand.comfort.id, min: bBand.comfort.min, max: bBand.comfort.max, label: bBand.comfort.label } : null,
        stretch: bBand ? { id: bBand.stretch.id, min: bBand.stretch.min, max: bBand.stretch.max, label: bBand.stretch.label } : null
      },
      guests: { range: gBand ? (gBand.agreed ? { min: gBand.agreed.min, max: gBand.agreed.max } : { min: gBand.comfort.min, max: gBand.stretch.max }) : null,
        agreed: gBand && gBand.agreed ? gBand.agreed.id : null },
      location: {
        region: wherePick ? wherePick.id : null, region_label: wherePick ? wherePick.label : null,
        scope: wherePick ? wherePick.scope : (scopes[0] || null), venue_vibes: venueTags,
        venue_vibe_labels: venueTags.map(function (v) { return D.VENUE_LABELS[v]; })
      },
      timeframe: { id: whenPick ? whenPick.id : null, label: whenPick ? whenPick.label : null,
        months_min: whenPick ? whenPick.min : null, months_max: whenPick ? whenPick.max : null },
      style: { keywords: topKeys(words, 5), formality: avg(formality), energy: avg(energy) },
      priorities: { top3: ranked, splurge: splurge, save: save },
      values: [], dealbreakers: deal ? [deal.id] : [],
      family_involvement: family ? family.id : null,
      spicy: ['bar', 'kids', 'firstlook'].reduce(function (acc, id) {
        acc[id] = summaries.map(function (s) { var o = soloOpt(s.answers, id); return o ? o.id : null; }); return acc;
      }, {}),
      friction: friction.map(function (f) { return { id: f.id, title: f.title, severity: f.severity, detail: f.detail, prompt: f.prompt }; }),
      raw: { partner_a: encodeSolo(input.a), partner_b: input.b ? encodeSolo(input.b) : null, joint: joint || null }
    };
    brief.values = valuesOf(summaries, joint, ranked, brief.budget);
    brief.next_decisions = nextDecisions(brief);
    return {
      names: names, summaries: summaries, vec: vec, animal: animal, alignment: pct, friction: friction,
      priorities: ranked, brief: brief, venues: venueTags
    };
  }

  // A friend's own result plus how alike they are to the couple (cosine of animal vectors).
  function friendResult(answers, couplePair) {
    var s = summariseSolo(answers), pairVec = D.ANIMALS.map(function (a, i) { return i === couplePair[0] ? 2 : (i === couplePair[1] ? 1 : 0.1); });
    return { summary: s, animal: hybridFor(s.vec), likeness: Math.round(100 * cosine(s.vec, normalise(pairVec))) };
  }

  var api = {
    byId: byId, cleanName: cleanName, encodeSolo: encodeSolo, decodeSolo: decodeSolo, partnerHash: partnerHash,
    parseHash: parseHash, zooHash: zooHash, summariseSolo: summariseSolo, hybridFor: hybridFor, alignment: alignment,
    buildCouple: buildCouple, friendResult: friendResult, BRIEF_SCHEMA: BRIEF_SCHEMA
  };
  root.OmnyQuizEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
