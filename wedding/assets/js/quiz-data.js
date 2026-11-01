// Wedding Animal Quiz v2 — deterministic content contract from the reviewed specification.
(function (root) {
  'use strict';
  var DIMENSIONS = [
    { code: 'O', name: 'Originality', low: 'Traditional', high: 'Distinctive' },
    { code: 'S', name: 'Structure', low: 'Flexible', high: 'Structured' },
    { code: 'G', name: 'Guest orientation', low: 'Intimate', high: 'Community-centred' },
    { code: 'F', name: 'Financial trade-off', low: 'Cost certainty', high: 'Experience investment' },
    { code: 'D', name: 'Decision tempo', low: 'Explore', high: 'Decide promptly' },
    { code: 'C', name: 'Decision ownership', low: 'Shared consensus', high: 'Delegated autonomy' }
  ];
  var COMPARISON_PROMPTS = {
    O: 'Which two visual elements matter most to each of you?',
    S: 'Which deadlines need reminders and which can remain flexible?',
    G: 'What are your ideal and maximum guest numbers?',
    F: 'What is your hard budget cap and top-three priorities?',
    D: 'How many alternatives should you compare before choosing?',
    C: 'Which categories need both partners’ approval?'
  };
  var RESULT_TEMPLATE = {
    playfulNote: 'This is a playful planning profile, not a psychological or compatibility test.',
    evidenceLead: 'Based on your choices of {choice_one} and {choice_two}',
    interpretation: 'you seem to lean towards {dimension_description}.',
    strength: 'This may help you with {practical_strength}.',
    friction: 'One decision to clarify is {conditional_friction}.',
    action: 'Try {concrete_action}.'
  };
  function option(id, label, image, weight, art) { return { id: id, label: label, img: image, weight: weight, art: art }; }
  var QUESTIONS = [
    { id: 'Q01', dimension: 'O', core: true, title: 'Which celebration feels most like yours?', opts: [
      option('A', 'Classic and timeless', 'ballroom', -2, 'Formal ceremony with white florals'),
      option('B', 'Relaxed and natural', 'lawn', -1, 'Garden tables with greenery'),
      option('C', 'Personal and eclectic', 'decor', 1, 'Handmade and multicultural details'),
      option('D', 'Unexpected and artistic', 'night', 2, 'Bold contemporary installation') ] },
    { id: 'Q02', dimension: 'S', core: true, title: 'Which planning style feels easiest?', opts: [
      option('A', 'Only the next decision', 'placecard', -2, 'A single clear task card'),
      option('B', 'Simple monthly checklist', 'registry', -1, 'A short monthly list'),
      option('C', 'Flexible plan with alerts', 'strings', 1, 'A minimal task board with reminders'),
      option('D', 'Detailed milestones', 'sydney', 2, 'A timeline with checkpoints') ] },
    { id: 'Q03', dimension: 'G', core: true, title: 'What guest atmosphere feels right?', opts: [
      option('A', 'Closest people only', 'candlelit', -2, 'A tiny candlelit dinner'),
      option('B', 'Small warm gathering', 'pastel', -1, 'An intimate garden gathering'),
      option('C', 'Lively extended circle', 'family', 1, 'A lively medium reception'),
      option('D', 'Big community celebration', 'sparklers', 2, 'A large shared dance floor') ] },
    { id: 'Q04', dimension: 'F', core: true, title: 'A dream feature costs extra. What do you do?', opts: [
      option('A', 'Protect the original cap', 'registry', -2, 'A budget sheet with a firm cap'),
      option('B', 'Find a comparable alternative', 'charcuterie', -1, 'Two comparable alternatives'),
      option('C', 'Reallocate from another category', 'decor', 1, 'Budget category sliders'),
      option('D', 'Stretch for the memorable feature', 'fireworks', 2, 'A dramatic reception moment') ] },
    { id: 'Q05', dimension: 'D', core: true, title: 'How would you choose a venue?', opts: [
      option('A', 'Explore many possibilities', 'santorini', -2, 'A broad venue moodboard'),
      option('B', 'Tour several and decide by feeling', 'estate', -1, 'Several venue visits'),
      option('C', 'Compare three strong matches', 'beach', 1, 'Three clear venue cards'),
      option('D', 'Choose from two clear finalists', 'restaurant', 2, 'Two finalist venue cards') ] },
    { id: 'Q06', dimension: 'C', core: true, title: 'How should you divide decisions?', opts: [
      option('A', 'Discuss nearly every choice', 'veilkiss', -2, 'A couple planning every choice together'),
      option('B', 'Agree priorities, then collaborate', 'longtable', -1, 'A shared priorities board'),
      option('C', 'Own separate categories with check-ins', 'camera', 1, 'A split task board with check-ins'),
      option('D', 'Delegate to the person most interested', 'attire', 2, 'One clear owner on a task card') ] },
    { id: 'Q07', dimension: 'O', core: false, title: 'Pick a complimentary styling upgrade.', opts: [
      option('A', 'Classic flowers', 'bouquet', -2, 'Classic white flower arrangements'),
      option('B', 'Subtle personalised stationery', 'placecard', -1, 'Personalised monogram stationery'),
      option('C', 'Artisan handcrafted decor', 'decor', 1, 'Bespoke handcrafted table pieces'),
      option('D', 'Bold colour installation', 'pastel', 2, 'A vivid floral installation') ] },
    { id: 'Q08', dimension: 'S', core: false, title: 'A supplier has not replied. What feels best?', opts: [
      option('A', 'Wait a little longer', 'candlelit', -2, 'A calm pause before following up'),
      option('B', 'Send one gentle reminder', 'placecard', -1, 'One friendly reminder'),
      option('C', 'Set a follow-up deadline', 'sydney', 1, 'A calendar alert with a deadline'),
      option('D', 'Track a sequence of follow-ups', 'strings', 2, 'A visible follow-up workflow') ] },
    { id: 'Q09', dimension: 'G', core: false, title: 'Which guest experience matters most?', opts: [
      option('A', 'Time with our closest people', 'veilkiss', -2, 'A small heartfelt toast'),
      option('B', 'Meaningful conversations', 'restaurant', -1, 'An intimate dinner conversation'),
      option('C', 'Everyone feeling included', 'family', 1, 'An inclusive mingling group'),
      option('D', 'A huge shared celebration', 'fireworks', 2, 'A large joyful party') ] },
    { id: 'Q10', dimension: 'F', core: false, title: 'How would you use an unexpected saving?', opts: [
      option('A', 'Keep it as contingency', 'registry', -2, 'A protected reserve fund'),
      option('B', 'Reduce overall spend', 'placecard', -1, 'A lower total budget bar'),
      option('C', 'Upgrade the top priority', 'camera', 1, 'An enhanced priority feature'),
      option('D', 'Create an unforgettable moment', 'sparklers', 2, 'An immersive celebration moment') ] },
    { id: 'Q11', dimension: 'D', core: false, title: 'Three photographers look suitable. What next?', opts: [
      option('A', 'Review many more portfolios', 'camera', -2, 'Many photography portfolios'),
      option('B', 'Request additional galleries', 'veilfield', -1, 'Several full gallery comparisons'),
      option('C', 'Meet the top two', 'veilfield', 1, 'Two photographer profiles'),
      option('D', 'Book the best match', 'veilkiss', 2, 'A confirmed photographer booking') ] },
    { id: 'Q12', dimension: 'C', core: false, title: 'How should vendor emails be approved?', opts: [
      option('A', 'Both approve each message', 'longtable', -2, 'Two approvals on every message'),
      option('B', 'Both approve a reusable template', 'placecard', -1, 'A shared approved message template'),
      option('C', 'Assigned owner approves within limits', 'camera', 1, 'An owner badge with clear limits'),
      option('D', 'Delegate categories with clear limits', 'attire', 2, 'Delegated categories and thresholds') ] }
  ];
  var ARCHETYPES = [
    { id: 'fox', name: 'Fox', subtitle: 'Creative explorer', photo: 'an-fox', vector: [90, 40, 45, 65, 20, 60], interpretation: 'You enjoy distinctive options and exploring possibilities.', strength: 'building an original shortlist', friction: 'when exploration should end', action: 'Set a shortlist deadline.' },
    { id: 'owl', name: 'Owl', subtitle: 'Thoughtful organiser', photo: 'an-owl', vector: [40, 90, 45, 30, 25, 40], interpretation: 'You value detailed plans and careful comparison.', strength: 'making criteria visible', friction: 'how much evidence is enough', action: 'Set decision criteria.' },
    { id: 'dolphin', name: 'Dolphin', subtitle: 'People-first collaborator', photo: 'an-dolphin', vector: [55, 55, 85, 55, 45, 20], interpretation: 'You favour inclusion and shared discussion.', strength: 'keeping people involved', friction: 'who has the final say', action: 'Agree guest priorities.' },
    { id: 'elephant', name: 'Elephant', subtitle: 'Grounded guardian', photo: 'an-elephant', vector: [25, 85, 75, 20, 70, 35], interpretation: 'You prefer predictability and cost clarity.', strength: 'protecting the plan from surprises', friction: 'where flexibility is worthwhile', action: 'Create contingency and milestones.' },
    { id: 'peacock', name: 'Peacock', subtitle: 'Experience curator', photo: 'an-peacock', vector: [90, 55, 75, 90, 65, 50], interpretation: 'You favour memorable, expressive experiences.', strength: 'identifying high-impact moments', friction: 'which splurges deserve priority', action: 'Rank splurges against a ceiling.' },
    { id: 'otter', name: 'Otter', subtitle: 'Flexible improviser', photo: 'an-otter', vector: [65, 20, 60, 60, 35, 65], interpretation: 'You prefer flexibility over detailed plans.', strength: 'adapting without losing the mood', friction: 'which deadlines cannot move', action: 'Automate key reminders.' },
    { id: 'beaver', name: 'Beaver', subtitle: 'Practical executor', photo: 'an-beaver', vector: [35, 95, 40, 25, 90, 80], interpretation: 'You value ownership and prompt decisions.', strength: 'turning choices into action', friction: 'which choices need joint approval', action: 'Delegate tasks with approval thresholds.' },
    { id: 'swan', name: 'Swan', subtitle: 'Intimate romantic', photo: 'an-swan', vector: [45, 55, 15, 60, 50, 25], interpretation: 'You favour an intimate, meaningful atmosphere.', strength: 'protecting the guest experience', friction: 'how large the celebration should become', action: 'Prioritise guest experience over scale.' }
  ];
  var api = {
    VERSION: 2,
    VERSION_LABEL: 'wedding-animal-v2.0.0',
    DIMENSIONS: DIMENSIONS,
    QUESTIONS: QUESTIONS,
    SOLO: QUESTIONS,
    ARCHETYPES: ARCHETYPES,
    COMPARISON_PROMPTS: COMPARISON_PROMPTS,
    RESULT_TEMPLATE: RESULT_TEMPLATE
  };
  root.OmnyQuizData = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
