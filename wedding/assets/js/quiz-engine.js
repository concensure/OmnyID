// Wedding Animal Quiz v2 — pure deterministic scoring, comparison and handoff.
(function (root) {
  'use strict';
  var D = root.OmnyQuizData;
  if (!D && typeof require === 'function') D = require('./quiz-data.js');

  function byId(list, id) { return list.find(function (item) { return item.id === id; }) || null; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function answerIndex(question, value) {
    if (Number.isInteger(value) && value >= 0 && value < question.opts.length) return value;
    if (typeof value === 'string') return question.opts.findIndex(function (item) { return item.id === value; });
    return -1;
  }
  function normalizeAnswers(answers) {
    var result = {};
    D.QUESTIONS.forEach(function (question) {
      var index = answerIndex(question, answers && answers[question.id]);
      if (index >= 0) result[question.id] = question.opts[index].id;
    });
    return result;
  }
  function scoreAnswers(answers) {
    var safe = normalizeAnswers(answers);
    return D.DIMENSIONS.map(function (dimension) {
      var observed = D.QUESTIONS.filter(function (question) {
        return question.dimension === dimension.code && safe[question.id];
      }).map(function (question) {
        return byId(question.opts, safe[question.id]).weight;
      });
      var mean = observed.length ? observed.reduce(function (sum, value) { return sum + value; }, 0) / observed.length : null;
      return {
        code: dimension.code,
        score: mean == null ? null : clamp(Math.round(50 + 25 * mean), 0, 100),
        count: observed.length
      };
    });
  }
  function nextQuestion(answers, skippedIds) {
    var safe = normalizeAnswers(answers);
    var skipped = new Set(Array.isArray(skippedIds) ? skippedIds : []);
    var available = D.QUESTIONS.filter(function (question) {
      return !safe[question.id] && !skipped.has(question.id);
    });
    var core = available.find(function (question) { return question.core; });
    if (core) return core;
    var counts = Object.fromEntries(scoreAnswers(safe).map(function (score) {
      return [score.code, score.count];
    }));
    return available.sort(function (left, right) {
      return counts[left.dimension] - counts[right.dimension]
        || D.QUESTIONS.indexOf(left) - D.QUESTIONS.indexOf(right);
    })[0] || null;
  }
  function distance(archetype, scores) {
    var observed = scores.map(function (item, index) { return { item: item, index: index }; })
      .filter(function (entry) { return entry.item.score != null; });
    if (observed.length < 4) return Number.POSITIVE_INFINITY;
    return observed.reduce(function (sum, entry) {
      var delta = entry.item.score - archetype.vector[entry.index];
      return sum + delta * delta;
    }, 0) / observed.length;
  }
  function assignAnimal(scores) {
    var ranked = D.ARCHETYPES.map(function (animal) { return { animal: animal, distance: distance(animal, scores) }; })
      // Stable ids make an equal-distance result repeatable across browsers and revisions.
      .sort(function (left, right) { return left.distance - right.distance || left.animal.id.localeCompare(right.animal.id); });
    if (!Number.isFinite(ranked[0].distance)) return { animal: null, runnerUp: null, ranked: ranked };
    var close = ranked[1] && ranked[1].distance - ranked[0].distance <= 225;
    return { animal: ranked[0].animal, runnerUp: close ? ranked[1].animal : null, ranked: ranked };
  }
  function answeredEvidence(answers) {
    var safe = normalizeAnswers(answers);
    return D.QUESTIONS.filter(function (question) { return safe[question.id]; }).map(function (question) {
      var option = byId(question.opts, safe[question.id]);
      return { answer_id: question.id + ':' + option.id, question_id: question.id, dimension: question.dimension, label: option.label, weight: option.weight };
    });
  }
  function buildResult(answers) {
    var safe = normalizeAnswers(answers);
    var scores = scoreAnswers(safe);
    var assignment = assignAnimal(scores);
    var evidence = answeredEvidence(safe);
    return {
      quiz_version: 2,
      answers: safe,
      dimension_scores: scores,
      animal_id: assignment.animal ? assignment.animal.id : null,
      runner_up_id: assignment.runnerUp ? assignment.runnerUp.id : null,
      animal: assignment.animal,
      runner_up: assignment.runnerUp,
      evidence: evidence,
      evidence_answer_ids: evidence.map(function (item) { return item.answer_id; }),
      answered_count: evidence.length
    };
  }
  function comparison(firstAnswers, secondAnswers) {
    var first = buildResult(firstAnswers), second = buildResult(secondAnswers);
    var differences = [];
    first.dimension_scores.forEach(function (left, index) {
      var right = second.dimension_scores[index], dimension = D.DIMENSIONS[index];
      if (left.score == null || right.score == null) return;
      var gap = Math.abs(left.score - right.score);
      differences.push({ code: dimension.code, name: dimension.name, difference: gap,
        prompt: D.COMPARISON_PROMPTS[dimension.code],
        state: gap < 20 ? 'broadly_aligned' : gap < 40 ? 'worth_discussing' : 'priority_discussion' });
    });
    var discussions = differences.filter(function (item) { return item.difference >= 20; })
      .sort(function (a, b) { return b.difference - a.difference; }).slice(0, 2);
    var agreement = differences.filter(function (item) { return item.difference < 20; })
      .sort(function (a, b) { return a.difference - b.difference; })[0] || null;
    return { first: first, second: second, agreement: agreement, discussions: discussions };
  }
  function encodeAnswers(answers) {
    var safe = normalizeAnswers(answers);
    return D.QUESTIONS.map(function (question) {
      var id = safe[question.id], index = id ? question.opts.findIndex(function (item) { return item.id === id; }) : -1;
      return index < 0 ? 'x' : index.toString(4);
    }).join('');
  }
  function decodeAnswers(code) {
    if (typeof code !== 'string' || code.length !== D.QUESTIONS.length || !/^[0-3x]+$/.test(code)) return null;
    var result = {};
    D.QUESTIONS.forEach(function (question, index) {
      if (code[index] !== 'x') result[question.id] = question.opts[Number(code[index])].id;
    });
    return result;
  }
  function partnerHash(answers) { return '#p2=' + encodeAnswers(answers); }
  function coupleHash(first, second) { return '#c2=' + encodeAnswers(first) + '.' + encodeAnswers(second); }
  function parseHash(hash) {
    var raw = String(hash || '');
    if (raw.length > 200) return null;
    if (raw.indexOf('#p2=') === 0) {
      var partnerAnswers = decodeAnswers(raw.slice(4));
      return partnerAnswers ? { kind: 'p2', answers: partnerAnswers } : null;
    }
    if (raw.indexOf('#c2=') === 0) {
      var pair = raw.slice(4).split('.');
      var first = pair.length === 2 ? decodeAnswers(pair[0]) : null;
      var second = pair.length === 2 ? decodeAnswers(pair[1]) : null;
      return first && second ? { kind: 'c2', first: first, second: second } : null;
    }
    return null;
  }
  function endpointLabel(score, dimension) {
    if (score == null) return null;
    if (score <= 35) return dimension.low;
    if (score >= 65) return dimension.high;
    return 'Balanced ' + dimension.name.toLowerCase();
  }
  function buildHandoff(result, now) {
    var created = now instanceof Date ? now : new Date();
    var expires = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
    var labels = {};
    result.dimension_scores.forEach(function (score, index) { labels[score.code] = endpointLabel(score.score, D.DIMENSIONS[index]); });
    return {
      version: 2,
      quiz_version: 2,
      answers: Object.entries(result.answers).map(function (entry) {
        return { question_id: entry[0], option_id: entry[1] };
      }),
      created_at: created.toISOString(),
      expires_at: expires.toISOString(),
      animal_id: result.animal_id,
      runner_up_id: result.runner_up_id,
      animal_title: result.animal ? result.animal.name + ' — ' + result.animal.subtitle : null,
      dimension_scores: result.dimension_scores,
      evidence_answer_ids: result.evidence_answer_ids,
      evidence_labels: result.evidence.map(function (item) { return item.label; }),
      atmosphere_keywords: [labels.O].filter(Boolean),
      values: [labels.S, labels.G, labels.F, labels.D, labels.C].filter(Boolean),
      planning_preferences: {
        inspiration: labels.O,
        reminders: labels.S,
        guest_planning: labels.G,
        budget_trade_off: labels.F,
        shortlist_tempo: labels.D,
        approval_workflow: labels.C
      },
      consent: { account_import: false, partner_comparison: false },
      requires_confirmation: true
    };
  }
  var api = { byId: byId, normalizeAnswers: normalizeAnswers, scoreAnswers: scoreAnswers,
    nextQuestion: nextQuestion, assignAnimal: assignAnimal,
    buildResult: buildResult, comparison: comparison, encodeAnswers: encodeAnswers, decodeAnswers: decodeAnswers,
    partnerHash: partnerHash, coupleHash: coupleHash, parseHash: parseHash, buildHandoff: buildHandoff };
  root.OmnyQuizEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
