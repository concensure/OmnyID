// Wedding Animal Quiz v2 — accessible image-first UI; scoring remains in quiz-engine.js.
(function () {
  'use strict';
  var D = window.OmnyQuizData, E = window.OmnyQuizEngine;
  var app = document.getElementById('quizApp');
  if (!app || !D || !E) return;
  var STORE_KEY = 'omnyid.wedding.animal_quiz.progress.v2';
  var HANDOFF_KEY = 'omnyid.wedding.animal_quiz.handoff.v1';
  var LEGACY_KEY = 'omnyid.wedding.coupleBrief.v1';
  var IMG = 'assets/images/quiz/';
  var state = { stage: 'intro', index: 0, answers: {}, invited: null, comparison: null };

  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
  }); }
  function photo(name) { return IMG + name + '.webp'; }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ version: 2, index: state.index, answers: state.answers })); } catch (_) {}
  }
  function load() {
    try {
      var parsed = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (parsed && parsed.version === 2) {
        state.answers = E.normalizeAnswers(parsed.answers);
        state.index = Math.max(0, Math.min(D.QUESTIONS.length - 1, Number(parsed.index) || 0));
      }
    } catch (_) {}
  }
  function clearResult() {
    try { localStorage.removeItem(STORE_KEY); localStorage.removeItem(HANDOFF_KEY); localStorage.removeItem(LEGACY_KEY); } catch (_) {}
  }
  function setView(html, stage) {
    state.stage = stage;
    app.innerHTML = html + '<div class="qz-toast" role="status" aria-live="polite"></div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    var heading = app.querySelector('h1, h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus({ preventScroll: true }); }
  }
  function toast(message) {
    var element = app.querySelector('.qz-toast');
    if (!element) return;
    element.textContent = message; element.classList.add('is-on');
    window.setTimeout(function () { element.classList.remove('is-on'); }, 2600);
  }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return false; });
    var area = document.createElement('textarea'); area.value = text; document.body.appendChild(area); area.select();
    var ok = false; try { ok = document.execCommand('copy'); } catch (_) {} document.body.removeChild(area); return Promise.resolve(ok);
  }
  function answerCount() { return Object.keys(E.normalizeAnswers(state.answers)).length; }
  function introView() {
    var invite = state.invited ? '<div class="qz-banner"><strong>Someone invited you to compare planning styles.</strong> Your answers remain yours until you choose to share the comparison back.</div>' : '';
    var resume = answerCount() ? '<button type="button" class="btn btn-outline btn-lg" data-action="resume">Continue where I left off</button>' : '';
    setView(invite + '<section class="qz-hero"><p class="qz-kicker">A playful planning profile</p><h1>Find my Wedding Animal</h1>' +
      '<p class="qz-lead">Twelve visual choices reveal how you prefer to plan—not your personality, compatibility or future. See an early result after six, or answer all twelve for a fuller profile.</p>' +
      '<div class="qz-actions"><button type="button" class="btn btn-primary btn-lg" data-action="start">Start the quiz</button>' + resume + '</div>' +
      '<p class="qz-privacy">No email wall. Answers stay in this browser unless you explicitly take the result into your OmnyID workspace.</p></section>', 'intro');
  }
  function optionTile(option, selected, index) {
    return '<button type="button" class="qz-tile' + (selected ? ' is-picked' : '') + '" aria-pressed="' + (selected ? 'true' : 'false') + '" data-option="' + index + '">' +
      '<img src="' + photo(option.img) + '" alt="' + esc(option.art) + '" width="480" height="320" loading="' + (index < 2 ? 'eager' : 'lazy') + '" decoding="async">' +
      '<span class="qz-tile-copy"><strong>' + esc(option.label) + '</strong></span></button>';
  }
  function questionView() {
    var question = D.QUESTIONS[state.index], selected = state.answers[question.id];
    var canReveal = answerCount() >= 6;
    var reveal = canReveal ? '<button type="button" class="btn btn-ghost" data-action="result">See my result now</button>' : '';
    setView('<div class="qz-progress"><div style="width:' + Math.round((state.index + 1) / D.QUESTIONS.length * 100) + '%"></div></div>' +
      '<section class="qz-question"><p class="qz-part">Question ' + (state.index + 1) + ' of ' + D.QUESTIONS.length + ' · ' + esc(question.dimension) + '</p>' +
      '<h1>' + esc(question.title) + '</h1><p class="qz-note">Choose the picture and wording that feels closest. Every endpoint is a valid preference.</p>' +
      '<div class="qz-grid" role="group" aria-label="' + esc(question.title) + '">' + question.opts.map(function (option, index) {
        return optionTile(option, selected === option.id, index);
      }).join('') + '</div><div class="qz-nav"><button type="button" class="btn btn-outline" data-action="back"' + (state.index === 0 ? ' disabled' : '') + '>Back</button>' +
      '<button type="button" class="btn btn-ghost" data-action="skip">Skip</button>' + reveal +
      '<button type="button" class="btn btn-primary" data-action="next"' + (!selected ? ' disabled' : '') + '>Next</button></div></section>', 'question');
  }
  function dimensionBars(result) {
    return '<div class="qz-dimensions">' + result.dimension_scores.map(function (score, index) {
      var dimension = D.DIMENSIONS[index];
      if (score.score == null) return '<div class="qz-dimension"><div><strong>' + esc(dimension.name) + '</strong><span>Not answered</span></div></div>';
      return '<div class="qz-dimension"><div><strong>' + esc(dimension.name) + '</strong><span>' + score.count + ' answer' + (score.count === 1 ? '' : 's') + '</span></div>' +
        '<div class="qz-scale-labels"><span>' + esc(dimension.low) + '</span><span>' + esc(dimension.high) + '</span></div>' +
        '<div class="qz-scale" role="img" aria-label="' + esc(dimension.name + ': ' + score.score + ' out of 100') + '"><i style="width:' + score.score + '%"></i></div></div>';
    }).join('') + '</div>';
  }
  function interpretation(result) {
    var animal = result.animal;
    var evidence = result.evidence.slice(0, 2).map(function (item) { return item.label; });
    if (!animal) return 'Answer at least four dimensions to receive an animal. Unknown dimensions remain unknown rather than being treated as neutral.';
    return 'Based on your choices of ' + evidence.join(' and ') + ', ' + animal.interpretation.toLowerCase() + ' This may help you with ' + animal.strength + '. One decision to clarify is ' + animal.friction + '. Try: ' + animal.action;
  }
  function publish(result) {
    var handoff = E.buildHandoff(result, new Date());
    try { localStorage.setItem(HANDOFF_KEY, JSON.stringify(handoff)); } catch (_) {}
    window.OmnyQuiz = {
      getBrief: function () { return JSON.parse(JSON.stringify(handoff)); },
      getResult: function () { return JSON.parse(JSON.stringify(result)); }
    };
  }
  function resultView() {
    var result = E.buildResult(state.answers), animal = result.animal;
    publish(result);
    var heading = animal ? animal.name + ' — ' + animal.subtitle : 'Your planning profile';
    var crest = animal ? '<img class="qz-animal" src="' + photo(animal.photo) + '" alt="Illustrated ' + esc(animal.name) + '" width="190" height="190">' : '';
    var runner = result.runner_up ? '<p class="qz-note">A nearby storytelling label is ' + esc(result.runner_up.name + ' — ' + result.runner_up.subtitle) + '.</p>' : '';
    var continueButton = answerCount() < D.QUESTIONS.length ? '<button type="button" class="btn btn-outline" data-action="continue">Answer the remaining questions</button>' : '';
    var partner = '<button type="button" class="btn btn-outline" data-action="partner">Copy private partner link</button>';
    var compare = state.invited ? '<button type="button" class="btn btn-primary" data-action="compare">Compare our planning preferences</button>' : '';
    setView('<section class="qz-result-head">' + crest + '<p class="qz-part">Your Wedding Animal</p><h1>' + esc(heading) + '</h1>' +
      '<p class="qz-line">' + esc(interpretation(result)) + '</p>' + runner + '<p class="qz-note">This is a playful planning profile, not a psychological or compatibility test.</p></section>' +
      '<section class="qz-section"><h2>Your six planning preferences</h2>' + dimensionBars(result) + '</section>' +
      '<section class="qz-panel"><h2>Use this in your wedding plan</h2><p>Your result can suggest inspiration, reminder style, guest-planning approach, budget trade-offs, shortlist size and approval workflow. You review or edit every suggestion before it becomes a confirmed fact.</p>' +
      '<div class="qz-actions"><a class="btn btn-primary" href="../workspace/?auth=register&amp;source=wedding_quiz">Create account with this result</a>' + continueButton + partner + compare +
      '<a class="btn btn-ghost" href="../workspace/?auth=register&amp;source=wedding">Create an account without importing it</a>' +
      '<button type="button" class="btn btn-ghost" data-action="download">Download result</button><button type="button" class="btn btn-ghost" data-action="revise">Review my answers</button><button type="button" class="btn btn-ghost" data-action="delete">Delete this result</button></div></section>', 'result');
  }
  function compareView() {
    var comparison = state.comparison || E.comparison(state.invited || {}, state.answers);
    var agreement = comparison.agreement ? '<p><strong>Grounded agreement:</strong> Your closest preference is ' + esc(comparison.agreement.name.toLowerCase()) + '.</p>' : '';
    var discussions = comparison.discussions.length ? comparison.discussions.map(function (item) {
      return '<li><strong>' + esc(item.name) + ':</strong> ' + (item.state === 'priority_discussion' ? 'priority discussion' : 'worth discussing') + '. Agree a practical rule before this decision arrives.</li>';
    }).join('') : '<li>Your observed preferences are broadly aligned. Keep checking the actual decision rather than assuming agreement.</li>';
    setView('<section class="qz-result-head"><p class="qz-part">Optional partner comparison</p><h1>Where your planning preferences meet</h1>' + agreement +
      '<p class="qz-note">Differences are simple conversation thresholds, not a relationship score or prediction.</p></section>' +
      '<section class="qz-panel"><h2>Conversations worth having</h2><ol class="qz-steps">' + discussions + '</ol><div class="qz-actions"><button type="button" class="btn btn-primary" data-action="share-back">Copy comparison link</button><button type="button" class="btn btn-outline" data-action="result">Back to my result</button></div></section>', 'compare');
  }
  function render() {
    if (state.stage === 'question') questionView();
    else if (state.stage === 'result') resultView();
    else if (state.stage === 'compare') compareView();
    else introView();
  }
  function move(offset) {
    state.index = Math.max(0, Math.min(D.QUESTIONS.length - 1, state.index + offset)); save(); questionView();
  }
  function shareLink(hash, label) {
    var url = location.origin + location.pathname + hash;
    copy(label + ' ' + url).then(function (ok) { toast(ok ? 'Private link copied.' : 'Could not copy the link.'); });
  }
  app.addEventListener('click', function (event) {
    var button = event.target.closest('button, a'); if (!button) return;
    if (button.dataset.option != null) {
      var question = D.QUESTIONS[state.index], index = Number(button.dataset.option);
      state.answers[question.id] = question.opts[index].id; save(); questionView(); return;
    }
    var action = button.dataset.action;
    if (action === 'start') { state.index = 0; state.stage = 'question'; questionView(); }
    else if (action === 'resume') { state.stage = 'question'; questionView(); }
    else if (action === 'back') move(-1);
    else if (action === 'next') { if (state.index === D.QUESTIONS.length - 1) { state.stage = 'result'; resultView(); } else move(1); }
    else if (action === 'skip') { if (state.index === D.QUESTIONS.length - 1) { state.stage = 'result'; resultView(); } else move(1); }
    else if (action === 'result') { state.stage = 'result'; resultView(); }
    else if (action === 'continue') { state.index = Math.max(6, answerCount()); state.stage = 'question'; questionView(); }
    else if (action === 'revise') { state.index = 0; state.stage = 'question'; questionView(); }
    else if (action === 'partner') { var result = E.result(state.answers); shareLink(E.partnerHash(state.answers), 'I found my wedding animal: ' + (result.animal ? result.animal.title : 'a planning profile') + '. Take the same planning quiz so we can compare:'); }
    else if (action === 'compare') { state.comparison = E.comparison(state.invited || {}, state.answers); state.stage = 'compare'; compareView(); }
    else if (action === 'share-back') shareLink(E.coupleHash(state.invited || {}, state.answers), 'Here is our private Wedding Animal planning comparison:');
    else if (action === 'download') {
      var result = E.buildResult(state.answers), blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'omnyid-wedding-animal-result.json'; link.click(); window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 3000);
    } else if (action === 'delete') { clearResult(); state = { stage: 'intro', index: 0, answers: {}, invited: null, comparison: null }; introView(); }
  });
  function boot() {
    var hash = E.parseHash(location.hash); load();
    if (hash && hash.kind === 'p2') state.invited = hash.answers;
    if (hash && hash.kind === 'c2') { state.comparison = E.comparison(hash.first, hash.second); state.stage = 'compare'; compareView(); return; }
    introView();
  }
  boot();
}());
