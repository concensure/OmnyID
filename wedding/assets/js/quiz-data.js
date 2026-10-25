// The Wedding Animal Quiz — content and scoring tables (no logic here).
// Answers map to animals (+2 primary, +1 secondary) and to planning tags that feed the couple brief.
(function (root) {
  'use strict';

  // Order matters: animal indexes are encoded in share links.
  var ANIMALS = [
    { id: 'peacock', name: 'Peacock', emoji: '🦚', photo: 'an-peacock', line: 'Showstopper. Visual, social, unforgettable.',
      guest: 'First on the dance floor, last to leave the photos.',
      venues: ['ballroom', 'estate', 'hotel'], splurge: ['design', 'photos', 'music'], words: ['glamorous', 'theatrical', 'photogenic'] },
    { id: 'swan', name: 'Swan', emoji: '🦢', photo: 'an-swan', line: 'Classic, elegant, timeless.',
      guest: 'RSVPs early and brings the perfect gift.',
      venues: ['estate', 'garden', 'hotel'], splurge: ['venue', 'food', 'attire'], words: ['timeless', 'elegant', 'refined'] },
    { id: 'otter', name: 'Otter', emoji: '🦦', photo: 'an-otter', line: 'Playful, relaxed, here for the party.',
      guest: 'Will befriend the DJ before the first dance.',
      venues: ['backyard', 'beach', 'restaurant'], splurge: ['food', 'music', 'people'], words: ['playful', 'relaxed', 'fun'] },
    { id: 'owl', name: 'Owl', emoji: '🦉', photo: 'an-owl', line: 'Intentional, detailed, intimate.',
      guest: 'Knows everyone’s story by dessert.',
      venues: ['restaurant', 'registry', 'warehouse'], splurge: ['photos', 'ceremony', 'design'], words: ['intentional', 'intimate', 'meaningful'] },
    { id: 'fox', name: 'Fox', emoji: '🦊', photo: 'an-fox', line: 'Chic, modern, gloriously unconventional.',
      guest: 'Best outfit in the room, best gossip at the bar.',
      venues: ['warehouse', 'restaurant', 'registry'], splurge: ['design', 'attire', 'photos'], words: ['modern', 'chic', 'unconventional'] },
    { id: 'bear', name: 'Bear', emoji: '🐻', photo: 'an-bear', line: 'Cosy, family-first, generous.',
      guest: 'Hugs the grandparents, stays to help pack up.',
      venues: ['lodge', 'garden', 'backyard'], splurge: ['food', 'people', 'venue'], words: ['cosy', 'generous', 'warm'] },
    { id: 'dolphin', name: 'Dolphin', emoji: '🐬', photo: 'an-dolphin', line: 'Experiential, adventurous, social.',
      guest: 'Already planning the after-party trip.',
      venues: ['beach', 'vineyard', 'destination'], splurge: ['venue', 'ceremony', 'convenience'], words: ['adventurous', 'sunny', 'experiential'] },
    { id: 'flamingo', name: 'Flamingo', emoji: '🦩', photo: 'an-flamingo', line: 'Bold, colourful, festival-ready.',
      guest: 'Brings the glitter and starts the conga line.',
      venues: ['warehouse', 'garden', 'beach'], splurge: ['design', 'music', 'food'], words: ['bold', 'colourful', 'festive'] }
  ];

  var PRIORITIES = [
    { id: 'food', label: 'Food & drink', icon: '🍽️', a: [5, 3] },
    { id: 'music', label: 'Music & dancing', icon: '🎶', a: [2, 7] },
    { id: 'photos', label: 'Photos & video', icon: '📸', a: [4, 3] },
    { id: 'design', label: 'Design & flowers', icon: '💐', a: [7, 0] },
    { id: 'ceremony', label: 'The ceremony itself', icon: '💍', a: [1, 0] },
    { id: 'people', label: 'Everyone there & comfortable', icon: '🪑', a: [5, 3] },
    { id: 'venue', label: 'The venue', icon: '🏛️', a: [1, 6] },
    { id: 'attire', label: 'What we wear', icon: '👗', a: [4, 0] },
    { id: 'convenience', label: 'Keeping it easy', icon: '🧭', a: [6, 4] },
    { id: 'sustainability', label: 'Low-waste & sustainable', icon: '🌱', a: [6, 5] }
  ];

  var BUDGET_BANDS = [
    { id: 'b1', label: 'Under $15k', sub: 'Small and smart', icon: '🧺', min: 0, max: 15000, a: [4, 3] },
    { id: 'b2', label: '$15k – $30k', sub: 'Thoughtful and warm', icon: '🍷', min: 15000, max: 30000, a: [5, 2] },
    { id: 'b3', label: '$30k – $50k', sub: 'The full day', icon: '🌿', min: 30000, max: 50000, a: [1, 2] },
    { id: 'b4', label: '$50k – $80k', sub: 'Go big on the moments', icon: '🥂', min: 50000, max: 80000, a: [0, 7] },
    { id: 'b5', label: '$80k and up', sub: 'Spare no sparkle', icon: '💎', min: 80000, max: 200000, a: [6, 0] }
  ];

  var GUEST_BANDS = [
    { id: 'g1', label: '10 – 30', sub: 'Just our favourites', icon: '🕯️', min: 10, max: 30, a: [3, 4] },
    { id: 'g2', label: '30 – 60', sub: 'A proper dinner party', icon: '🍷', min: 30, max: 60, a: [3, 5] },
    { id: 'g3', label: '60 – 100', sub: 'Everyone we love', icon: '💐', min: 60, max: 100, a: [1, 0] },
    { id: 'g4', label: '100 – 150', sub: 'The full village', icon: '🎉', min: 100, max: 150, a: [2, 0] },
    { id: 'g5', label: '150 +', sub: 'A proper celebration', icon: '🎪', min: 150, max: 250, a: [7, 0] }
  ];

  var VENUE_LABELS = {
    ballroom: 'A grand ballroom', estate: 'A heritage estate', hotel: 'A boutique hotel', garden: 'A garden or lawn',
    beach: 'The beach or coast', vineyard: 'A vineyard or winery', restaurant: 'A restaurant or private dining room',
    warehouse: 'A warehouse, gallery or loft', lodge: 'A lodge or barn', backyard: 'A backyard or relaxed outdoor space',
    registry: 'A registry office or city venue', destination: 'A destination or overseas'
  };

  var SOLO = [
    { id: 'frame', title: 'Pick the wedding photo you’d frame', hint: 'Go with your gut.', grid: 'photo', opts: [
      { id: 'cliff', label: 'Cliff-top, just us', img: 'cliff', a: [6, 3], v: ['beach', 'destination'], s: ['adventurous', 'intimate'] },
      { id: 'ballroom', label: 'Chandelier ballroom', img: 'ballroom', a: [0, 1], v: ['ballroom', 'hotel'], s: ['glamorous', 'formal'] },
      { id: 'strings', label: 'String-light supper', img: 'strings', a: [2, 7], v: ['backyard', 'restaurant'], s: ['warm', 'relaxed'] },
      { id: 'night', label: 'Moody dance floor', img: 'night', a: [4, 7], v: ['warehouse'], s: ['moody', 'modern'] },
      { id: 'pastel', label: 'Pastel garden', img: 'pastel', a: [1, 7], v: ['garden'], s: ['romantic', 'soft'] },
      { id: 'longtable', label: 'Vineyard long table', img: 'longtable', a: [5, 6], v: ['vineyard', 'garden'], s: ['rustic', 'feast'] }
    ] },
    { id: 'guests', title: 'Your ideal guest list feels like…', hint: 'Not who you must invite. Who you want.', grid: 'icon', ordinal: true, bands: 'guests', opts: GUEST_BANDS },
    { id: 'budget', title: 'Which budget envelope can you open without flinching?', hint: 'Comfortable, not maximum. Skip if you’d rather not say.', grid: 'icon', ordinal: true, bands: 'budget', opts: BUDGET_BANDS },
    { id: 'cut', title: 'If you had to cut one, what would hurt most?', hint: 'The thing you’d miss tells us what you value.', grid: 'photo', opts: [
      { id: 'design', label: 'The flowers & decor', img: 'decor', a: [7, 0], p: { design: 2 }, s: ['styled'] },
      { id: 'food', label: 'The food & drink', img: 'charcuterie', a: [5, 2], p: { food: 2 }, s: ['feast'] },
      { id: 'music', label: 'The music & dancing', img: 'music', a: [2, 7], p: { music: 2 }, s: ['lively'] },
      { id: 'photos', label: 'The photographer', img: 'camera', a: [3, 7], p: { photos: 2 }, s: ['photogenic'] },
      { id: 'people', label: 'Part of the guest list', img: 'family', a: [5, 3], p: { people: 2 }, s: ['family-first'] },
      { id: 'attire', label: 'The outfits', img: 'attire', a: [4, 0], p: { attire: 2 }, s: ['dressed-up'] }
    ] },
    { id: 'venue', title: 'Which venue makes you exhale?', hint: 'Picture walking in on the day.', grid: 'photo', opts: [
      { id: 'registry', label: 'Registry or city venue', img: 'registry', a: [4, 3], v: ['registry'], scope: 'local' },
      { id: 'restaurant', label: 'A favourite restaurant', img: 'restaurant', a: [3, 4], v: ['restaurant'], scope: 'local' },
      { id: 'backyard', label: 'Backyard or garden', img: 'lawn', a: [2, 3], v: ['backyard', 'garden'], scope: 'local' },
      { id: 'lodge', label: 'Barn or lodge', img: 'barn', a: [5, 3], v: ['lodge'], scope: 'drivable' },
      { id: 'estate', label: 'Hotel or estate', img: 'estate', a: [1, 0], v: ['estate', 'hotel'], scope: 'drivable' },
      { id: 'beach', label: 'Beach or vineyard', img: 'beach', a: [6, 2], v: ['beach', 'vineyard'], scope: 'drivable' },
      { id: 'warehouse', label: 'Warehouse or gallery', img: 'night', a: [4, 7], v: ['warehouse'], scope: 'local' },
      { id: 'abroad', label: 'Somewhere abroad', img: 'santorini', a: [6, 0], v: ['destination'], scope: 'destination' }
    ] },
    { id: 'feel', title: 'A good wedding feels…', hint: 'One word, one picture.', grid: 'photo', opts: [
      { id: 'elegant', label: 'Elegant', img: 'candlelit', a: [1, 0], s: ['elegant'], energy: 1 },
      { id: 'playful', label: 'Playful', img: 'balloons', a: [7, 2], s: ['playful'], energy: 3 },
      { id: 'intimate', label: 'Intimate', img: 'veilkiss', a: [3, 5], s: ['intimate'], energy: 0 },
      { id: 'energy', label: 'High-energy', img: 'sparklers', a: [2, 7], s: ['high-energy'], energy: 4 },
      { id: 'cosy', label: 'Cosy', img: 'placecard', a: [5, 3], s: ['cosy'], energy: 1 },
      { id: 'effortless', label: 'Effortless', img: 'veilfield', a: [6, 4], s: ['effortless'], energy: 2 }
    ] },
    { id: 'dress', title: 'Your dress code instinct?', hint: 'What would guests be wearing?', grid: 'icon', ordinal: true, opts: [
      { id: 'blacktie', label: 'Black tie', sub: 'Dress up, please', icon: '🎩', a: [0, 1], formality: 4 },
      { id: 'cocktail', label: 'Cocktail', sub: 'Sharp but fun', icon: '🍸', a: [4, 0], formality: 3 },
      { id: 'smart', label: 'Smart casual', sub: 'Look nice, breathe easy', icon: '👔', a: [6, 3], formality: 2 },
      { id: 'themed', label: 'Themed', sub: 'Costume energy', icon: '🎭', a: [7, 2], formality: 2 },
      { id: 'whatever', label: 'Whatever’s comfy', sub: 'Just come', icon: '👟', a: [2, 5], formality: 0 }
    ] },
    { id: 'elope', title: 'Would you elope?', hint: 'Be honest. Nobody is judging.', grid: 'photo', opts: [
      { id: 'yes', label: 'Yes, in a heartbeat', img: 'lakeside', a: [6, 3], tag: 'privacy' },
      { id: 'family', label: 'Only if family approves', img: 'family', a: [5, 0], tag: 'family' },
      { id: 'no', label: 'No, a real wedding', img: 'bouquet', a: [1, 0], tag: 'tradition' },
      { id: 'party', label: 'No, we want a big party', img: 'fireworks', a: [7, 0], tag: 'celebration' }
    ] },
    { id: 'priorities', kind: 'top3', title: 'Pick your top 3 non-negotiables', hint: 'Tap three, in order. First tap counts most.', grid: 'icon', opts: PRIORITIES },
    { id: 'bar', spicy: true, title: 'Cash bar or dry wedding?', hint: 'The Spicy Three, 1 of 3. Which would you rather?', grid: 'icon', opts: [
      { id: 'cash', label: 'Cash bar', sub: 'Guests pay for drinks', icon: '💵', a: [4, 3] },
      { id: 'dry', label: 'Dry wedding', sub: 'No alcohol at all', icon: '🍵', a: [5, 4] },
      { id: 'limited', label: 'Limited free bar', sub: 'Beer, wine, one cocktail', icon: '🍷', a: [1, 5] },
      { id: 'open', label: 'Open bar all night', sub: 'Drinks on us', icon: '🥂', a: [7, 0] }
    ] },
    { id: 'kids', spicy: true, title: 'Kids at the wedding?', hint: 'The Spicy Three, 2 of 3.', grid: 'icon', opts: [
      { id: 'none', label: 'Adults only', sub: 'A grown-up night out', icon: '🥂', a: [4, 0] },
      { id: 'all', label: 'All kids welcome', sub: 'The more the merrier', icon: '🧒', a: [2, 3] },
      { id: 'family', label: 'Family kids only', sub: 'Nieces, nephews, cousins', icon: '👨‍👩‍👧', a: [5, 1] },
      { id: 'depends', label: 'Depends on the venue', sub: 'Ask us later', icon: '🤷', a: [6, 3] }
    ] },
    { id: 'firstlook', spicy: true, title: 'First look?', hint: 'The Spicy Three, 3 of 3.', grid: 'icon', opts: [
      { id: 'yes', label: 'Yes, see each other first', sub: 'Quiet moment, calmer photos', icon: '📸', a: [6, 4] },
      { id: 'no', label: 'No, save it for the aisle', sub: 'The big reveal', icon: '💒', a: [1, 0] },
      { id: 'later', label: 'Decide later', sub: 'Ask the photographer', icon: '🗓️', a: [2, 7] }
    ] }
  ];

  var JOINT = [
    { id: 'budget', title: 'Together: which budget envelope do you both agree on?', hint: 'The number you’d plan around. Skip if you’re not ready.', grid: 'icon', ordinal: true, bands: 'budget', opts: BUDGET_BANDS },
    { id: 'guests', title: 'Together: how many guests?', hint: 'Agree a range you can both live with.', grid: 'icon', ordinal: true, bands: 'guests', opts: GUEST_BANDS },
    { id: 'priorities', kind: 'top3', title: 'Together: your top 3 priorities', hint: 'Pick three as a couple, in order. This is where the money goes first.', grid: 'icon', opts: PRIORITIES },
    { id: 'family', title: 'How involved will family be?', hint: 'Both of your families count.', grid: 'icon', opts: [
      { id: 'traditional', label: 'Family has a big say', sub: 'Traditions and elders', icon: '👵' },
      { id: 'cohost', label: 'Family co-hosts', sub: 'Help and opinions welcome', icon: '🤝' },
      { id: 'independent', label: 'Our day, our call', sub: 'We decide, they attend', icon: '🧭' },
      { id: 'compromise', label: 'We’ll find a middle path', sub: 'Case by case', icon: '⚖️' }
    ] },
    { id: 'dealbreaker', title: 'What would make you cancel the whole plan?', hint: 'The thing to protect at all costs.', grid: 'icon', opts: [
      { id: 'debt', label: 'Going into debt', sub: 'Money stress', icon: '💳' },
      { id: 'conflict', label: 'Family conflict', sub: 'Peace matters most', icon: '⚡' },
      { id: 'nophotos', label: 'No photos of the day', sub: 'Memories matter', icon: '📷' },
      { id: 'boring', label: 'A boring party', sub: 'Energy is everything', icon: '😴' },
      { id: 'generic', label: 'Feeling generic', sub: 'It has to be us', icon: '🧩' },
      { id: 'stress', label: 'Planning stress', sub: 'Calm over perfect', icon: '🌀' }
    ] },
    { id: 'whenwhere', kind: 'dual', title: 'When and where, roughly?', hint: 'Pick one of each. Rough is fine.', groups: [
      { id: 'when', label: 'When', grid: 'icon', opts: [
        { id: 'm6', label: 'Within 6 months', icon: '⚡', min: 0, max: 6 },
        { id: 'm12', label: '6–12 months', icon: '📅', min: 6, max: 12 },
        { id: 'm18', label: '12–18 months', icon: '🗓️', min: 12, max: 18 },
        { id: 'm24', label: '18+ months', icon: '🌱', min: 18, max: 36 },
        { id: 'none', label: 'No date yet', icon: '🔮', min: null, max: null }
      ] },
      { id: 'where', label: 'Where', grid: 'photo', opts: [
        { id: 'sydney', label: 'Sydney & harbour', img: 'sydney', scope: 'local' },
        { id: 'hunter', label: 'Hunter Valley', img: 'hunter', scope: 'drivable' },
        { id: 'blue', label: 'Blue Mountains', img: 'blue', scope: 'drivable' },
        { id: 'coast', label: 'NSW coast', img: 'bondi', scope: 'drivable' },
        { id: 'elsewhere', label: 'Elsewhere in Australia', icon: '🗺️', scope: 'destination' },
        { id: 'overseas', label: 'Overseas', img: 'santorini', scope: 'destination' }
      ] }
    ] }
  ];

  // Key is "lowIndex-highIndex" in ANIMALS order.
  var HYBRIDS = {
    '0-1': 'The Grand Gala', '0-2': 'The Glitter Party', '0-3': 'The Curated Showstopper', '0-4': 'The Designer Spectacle',
    '0-5': 'The Warm Spectacle', '0-6': 'The Destination Showstopper', '0-7': 'The Technicolour Ball',
    '1-2': 'The Elegant Hangout', '1-3': 'The Quiet Classic', '1-4': 'The Modern Classic', '1-5': 'The Heirloom Hug',
    '1-6': 'The Seaside Classic', '1-7': 'The Blush Gala',
    '2-3': 'The Playful Planners', '2-4': 'The City Party Crew', '2-5': 'The Backyard Hug Party', '2-6': 'The Beach Bash',
    '2-7': 'The Festival Fiesta',
    '3-4': 'The Clever Minimalists', '3-5': 'The Cosy Curators', '3-6': 'The Thoughtful Voyagers', '3-7': 'The Considered Carnival',
    '4-5': 'The Modern Hearth', '4-6': 'The Destination Design Trip', '4-7': 'The Neon Gallery',
    '5-6': 'The Family Getaway', '5-7': 'The Warm Fiesta',
    '6-7': 'The Island Carnival'
  };

  var DEALBREAKERS = { debt: 'No debt', conflict: 'No family conflict', nophotos: 'Great photos', boring: 'A brilliant party', generic: 'Feels like us', stress: 'Low stress' };

  // [source, creator, link, licence]. Every photo is CC0, public domain, CC BY or Unsplash licence.
  var CREDITS = {
    cliff: ['Unsplash', 'Vadim Paripa', 'https://unsplash.com/photos/PuXtB1B4zL8', 'Unsplash'],
    strings: ['Unsplash', 'Al Elmes', 'https://unsplash.com/photos/ULHxWq8reao', 'Unsplash'],
    night: ['Unsplash', 'Wesley Tingey', 'https://unsplash.com/photos/0CklaCuehpc', 'Unsplash'],
    pastel: ['Unsplash', 'Beatriz Perez Moya', 'https://unsplash.com/photos/M2T1j-6Fn8w', 'Unsplash'],
    longtable: ['Unsplash', 'Photos by Lanty', 'https://unsplash.com/photos/O38Id_cyV4M', 'Unsplash'],
    registry: ['Unsplash', 'Sandy Millar', 'https://unsplash.com/photos/YeJWDWeIZho', 'Unsplash'],
    lawn: ['Unsplash', 'Leonardo Miranda', 'https://unsplash.com/photos/riHGdvluDk8', 'Unsplash'],
    estate: ['Unsplash', 'Ulyana Tim', 'https://unsplash.com/photos/AbnCRgL2DNs', 'Unsplash'],
    beach: ['Unsplash', 'Getulio Moraes', 'https://unsplash.com/photos/jbtbin3u0Xw', 'Unsplash'],
    music: ['Unsplash', 'Luwadlin Bosman', 'https://unsplash.com/photos/P_HRPYpFTNA', 'Unsplash'],
    family: ['Unsplash', 'Mark Zamora', 'https://unsplash.com/photos/rqL9iNe6UPI', 'Unsplash'],
    attire: ['Unsplash', 'Maria Orlova', 'https://unsplash.com/photos/13naxFTumNA', 'Unsplash'],
    candlelit: ['Unsplash', 'Zhouxing Lu', 'https://unsplash.com/photos/LvSDR31F_Vc', 'Unsplash'],
    balloons: ['Unsplash', 'Zoriana Stakhniv', 'https://unsplash.com/photos/d_9i9TaOxfI', 'Unsplash'],
    veilkiss: ['Unsplash', 'Jakob Owens', 'https://unsplash.com/photos/mLIurLmSRAY', 'Unsplash'],
    sparklers: ['Unsplash', 'Fabio Alves', 'https://unsplash.com/photos/BpeTaQozgN4', 'Unsplash'],
    placecard: ['Unsplash', 'Paul Stollery', 'https://unsplash.com/', 'Unsplash'],
    veilfield: ['Unsplash', 'Elvis Bekmanis', 'https://unsplash.com/photos/WJc87MVcDaA', 'Unsplash'],
    lakeside: ['Unsplash', 'Eugenia Pan', 'https://unsplash.com/photos/1Bs2sZ9fD2Q', 'Unsplash'],
    bouquet: ['Unsplash', 'Allef Vinicius', 'https://unsplash.com/photos/DmUbkltYsKI', 'Unsplash'],
    fireworks: ['Unsplash', 'Jonathan Borba', 'https://unsplash.com/photos/tpzrqZ6VVBk', 'Unsplash'],
    ballroom: ['Rawpixel', 'Rawpixel', 'https://www.rawpixel.com/image/6030401/photo-image-public-domain-wedding-room', 'CC0'],
    restaurant: ['Flickr', 'Swami Stream', 'https://www.flickr.com/photos/21063397@N00/1328979437', 'CC BY'],
    barn: ['Flickr', 'qmnonic', 'https://www.flickr.com/photos/58575431@N00/2689144412', 'CC BY'],
    decor: ['Flickr', 'Tracy Hunter', 'https://www.flickr.com/photos/11121785@N00/164578909', 'CC BY'],
    camera: ['Wikimedia Commons', 'Mike Baird', 'https://commons.wikimedia.org/wiki/File:Wedding_photographer_preparing_shot.jpg', 'CC BY 2.0'],
    santorini: ['Wikimedia Commons', 'karol m', 'https://commons.wikimedia.org/wiki/File:Oia_Sunset_3.jpg', 'CC BY 2.0'],
    charcuterie: ['Wikimedia Commons', 'Daderot', 'https://commons.wikimedia.org/wiki/File:Charcuterie_board_-_Massachusetts.jpg', 'CC0'],
    sydney: ['Wikimedia Commons', 'Adam.J.W.C.', 'https://commons.wikimedia.org/wiki/File:Sydney_harbour_bridge_new_south_wales.jpg', 'CC BY 3.0'],
    hunter: ['Wikimedia Commons', 'F Delventhal', 'https://commons.wikimedia.org/wiki/File:Hunter_Valley_Means_Vineyards.jpg', 'CC BY 2.0'],
    blue: ['Wikimedia Commons', 'Rahmatdenas', 'https://commons.wikimedia.org/wiki/File:Three_Sisters_Blue_Mountains_2022_-_Denas.jpg', 'CC BY 4.0'],
    bondi: ['Wikimedia Commons', 'Wikimedia Commons contributor', 'https://commons.wikimedia.org/wiki/File:Bondi_Beach_in_January_2023.jpg', 'CC BY 2.0'],
    'an-peacock': ['Flickr', 'Bernard Spragg', 'https://www.flickr.com/photos/88123769@N02/8316435538', 'CC0'],
    'an-swan': ['Flickr', 'AlmightyWorm', 'https://www.flickr.com/photos/44212945@N03/37293177202', 'CC0'],
    'an-otter': ['Flickr', 'Yellowstone National Park', 'https://www.flickr.com/photos/80223459@N05/21714787463', 'Public domain'],
    'an-owl': ['Wikimedia Commons', 'Petr Kratochvil', 'https://commons.wikimedia.org/w/index.php?curid=20562521', 'CC0'],
    'an-fox': ['Flickr', 'Yellowstone National Park', 'https://www.flickr.com/photos/80223459@N05/26037387548', 'Public domain'],
    'an-bear': ['Flickr', 'USFWS Alaska', 'https://www.flickr.com/photos/54775250@N07/28482695320', 'Public domain'],
    'an-dolphin': ['Rawpixel', 'Rawpixel', 'https://www.rawpixel.com/image/6039086/photo-image-public-domain-nature-cute', 'CC0'],
    'an-flamingo': ['Flickr', 'Image Catalog', 'https://www.flickr.com/photos/132795455@N08/22886480410', 'CC0']
  };

  root.OmnyQuizData = {
    ANIMALS: ANIMALS, PRIORITIES: PRIORITIES, BUDGET_BANDS: BUDGET_BANDS, GUEST_BANDS: GUEST_BANDS,
    VENUE_LABELS: VENUE_LABELS, SOLO: SOLO, JOINT: JOINT, HYBRIDS: HYBRIDS, DEALBREAKERS: DEALBREAKERS, CREDITS: CREDITS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OmnyQuizData;
})(typeof window !== 'undefined' ? window : globalThis);
