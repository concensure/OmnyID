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
      description: 'Keep suppliers, quotes, guests and next decisions together for an intimate ceremony, a micro wedding or a larger celebration—without turning planning into a second job.',
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
      headline: 'Turn the guest spreadsheet into a list you can trust.',
      description: 'Bring a CSV, TSV or pasted table, then review households and uncertain replies before they become part of the plan.',
      benefit: 'Keep confirmed changes connected to final count, meals, seating and budget effects.',
      detailKicker: 'Guest-list proof',
      detailTitle: 'See what was understood before you save it',
      detailCopy: 'Review stated households, ungrouped people and ambiguous RSVP values instead of letting the import guess.',
      detailCtaLabel: 'See the guest-list review',
      detailDestination: '#guest-journey',
      demoId: 'overview',
      ctaLabel: 'Review a guest-list example',
      destination: '#guest-journey',
      granularity: 'G4 capability',
      variant: 'default',
      retrieval: {
        question: 'How can I move a wedding guest spreadsheet into one reliable plan?',
        directAnswer: 'Import CSV or TSV data or paste a table, review households and ambiguous replies, then use confirmed guest facts for final-count, meal, seating and budget decisions.',
        destinationPath: '/wedding/#guest-journey'
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
