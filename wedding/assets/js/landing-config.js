(function (root) {
  'use strict';

  /** @type {Record<string, {
   * id: string,
   * label: string,
   * headline: string,
   * description: string,
   * benefit: string,
   * demoId: string,
   * ctaLabel: string,
   * destination: string,
   * granularity: string,
   * variant: string,
   * retrieval: { question: string, directAnswer: string, destinationPath: string }
   * }>} */
  var contexts = {
    starting: {
      id: 'starting',
      label: 'Just getting started',
      headline: 'Less wedding admin. More of a wedding that feels like you.',
      description: 'Keep vendors, quotes, guests and next decisions together for an intimate ceremony, a small wedding or a larger celebration—without turning planning into a second job.',
      benefit: 'Start with a clear plan showing the next decisions that need you.',
      detailKicker: 'Start here',
      detailTitle: 'Your calm first step',
      detailCopy: 'Turn the date, place, guest count and budget you already know into one connected starting plan.',
      detailCtaLabel: 'Open my starting plan',
      detailDestination: '../workspace/?auth=register&source=wedding',
      demoId: 'overview',
      ctaLabel: 'Build my wedding plan',
      destination: '../workspace/?auth=register&source=wedding',
      granularity: 'G6 outcome',
      variant: 'default',
      retrieval: {
        question: 'How do we start planning a wedding in Australia?',
        directAnswer: 'Start with the date or season, location, guest range, total budget and the priorities you want later decisions to protect.',
        destinationPath: '/wedding/'
      }
    },
    vendors: {
      id: 'vendors',
      label: 'Finding vendors',
      headline: 'Compare wedding quotes without the confusion.',
      description: 'Keep each enquiry, reply and quote connected to your budget and priorities, with messages waiting for your approval.',
      benefit: 'See what is included, what is missing and what needs a follow-up.',
      detailKicker: 'Vendor stage',
      detailTitle: 'Compare evidence, then contact',
      detailCopy: 'Keep shortlists, exact enquiry drafts, replies and normalized quotes together before choosing a supplier.',
      detailCtaLabel: 'See vendor and quote flow',
      detailDestination: '#vendor-flow',
      demoId: 'vendors',
      ctaLabel: 'See how quote comparison works',
      destination: '#vendor-flow',
      granularity: 'G4 capability',
      variant: 'default',
      retrieval: {
        question: 'How do I compare wedding vendor quotes?',
        directAnswer: 'Compare the same inclusions, exclusions, assumptions, payment terms and unanswered questions before choosing a supplier.',
        destinationPath: '/wedding/#vendor-flow'
      }
    },
    guests: {
      id: 'guests',
      label: 'Managing guests',
      headline: 'Keep every guest detail in one place.',
      description: 'Connect RSVPs, households, meal choices, access needs and family boundaries without reconciling separate lists.',
      benefit: 'Review guest details together while keeping sensitive notes private.',
      detailKicker: 'Guest stage',
      detailTitle: 'One guest list, including replies',
      detailCopy: 'Track households, RSVP status, meal choices and access needs without copying updates between lists.',
      detailCtaLabel: 'See guest planning',
      detailDestination: '#preview',
      demoId: 'overview',
      ctaLabel: 'Explore guest planning',
      destination: '#preview',
      granularity: 'G4 capability',
      variant: 'default',
      retrieval: {
        question: 'How do I manage wedding RSVPs, dietary needs and seating?',
        directAnswer: 'Keep each guest, household, RSVP, meal choice, access need and seating assignment in one connected guest record.',
        destinationPath: '/wedding/#preview'
      }
    },
    final: {
      id: 'final',
      label: 'Final preparations',
      headline: 'Know what is ready and what still needs attention.',
      description: 'Bring deadlines, confirmations and the day-of run sheet together so changes stay visible to the people who need them.',
      benefit: 'Work from one source-linked run sheet instead of reconciling copies.',
      detailKicker: 'Final-prep stage',
      detailTitle: 'Bring the day-of plan into focus',
      detailCopy: 'Review confirmations, missing times and the next run-sheet action while keeping private notes out of vendor views.',
      detailCtaLabel: 'See the run-sheet workflow',
      detailDestination: '#wedding-run-sheet',
      demoId: 'timeline',
      ctaLabel: 'Explore day-of planning',
      destination: '#wedding-run-sheet',
      granularity: 'G5 functional outcome',
      variant: 'default',
      retrieval: {
        question: 'What should we have done in the final three months before an Australian wedding?',
        directAnswer: 'Confirm suppliers, payments, guest details, wet-weather plans and the master run sheet, then share only the relevant version with each person.',
        destinationPath: '/wedding/#wedding-run-sheet'
      }
    }
  };

  root.OmnyWeddingLanding = {
    contexts: contexts,
    defaultContext: 'starting',
    intents: {
      planning: 'starting',
      quotes: 'vendors',
      suppliers: 'vendors',
      guests: 'guests',
      dayof: 'final'
    },
    quizVariant: {
      headline: 'What kind of wedding planner are you?',
      description: 'Take the playful, image-first Wedding Animal Quiz, then choose whether to bring its suggestions into your plan.',
      ctaLabel: 'Find my wedding animal',
      destination: 'animal-quiz.html'
    }
  };
}(window));
