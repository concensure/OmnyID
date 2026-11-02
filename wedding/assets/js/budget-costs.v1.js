(function (global) {
  'use strict';
  global.OMNYID_WEDDING_BUDGET_COSTS_V1 = Object.freeze([
    { id: 'gst', label: 'GST where a quote is shown before tax', ask: 'Is GST included in the total?', appears: 'quote', trigger: 'always' },
    { id: 'service-charge', label: 'Service charges', ask: 'Is there a service charge, and what does it apply to?', appears: 'quote', trigger: 'always' },
    { id: 'card-surcharge', label: 'Card or payment surcharges', ask: 'Do any payment methods add a surcharge?', appears: 'invoice', trigger: 'always' },
    { id: 'overtime', label: 'Overtime', ask: 'What is the overtime rate and when does it begin?', appears: 'day-of', trigger: 'always' },
    { id: 'vendor-meals', label: 'Meals for working vendors', ask: 'How are vendor and staff meals priced?', appears: 'quote', trigger: 'always' },
    { id: 'price-rise', label: 'Price changes before the wedding', ask: 'Is this price fixed through our wedding date?', appears: 'invoice', trigger: 'always' },
    { id: 'insurance', label: 'Wedding or event insurance', ask: 'What insurance does the venue require us to hold?', appears: 'quote', trigger: 'always' },
    { id: 'paperwork', label: 'Celebrant and marriage paperwork', ask: 'Which legal and lodgement fees are included?', appears: 'quote', trigger: 'always' },
    { id: 'hire-extras', label: 'Furniture, linen, glassware and equipment hire', ask: 'Which hire items are included and which cost extra?', appears: 'quote', trigger: 'always' },
    { id: 'cleaning-security', label: 'Cleaning and security', ask: 'Are cleaning and security included?', appears: 'quote', trigger: 'always' },
    { id: 'alterations', label: 'Alterations and final fittings', ask: 'How many fittings and alterations are included?', appears: 'invoice', trigger: 'always' },
    { id: 'beauty-trials', label: 'Hair and makeup trials or touch-ups', ask: 'Are trials, travel and touch-ups included?', appears: 'quote', trigger: 'always' },
    { id: 'photo-overtime', label: 'Photography or video overtime', ask: 'What extra coverage and travel cost per hour?', appears: 'day-of', trigger: 'always' },
    { id: 'album-prints', label: 'Albums, prints and delivery', ask: 'Which albums, prints and delivery costs are included?', appears: 'invoice', trigger: 'always' },
    { id: 'cake-cutting', label: 'Cake cutting or plating', ask: 'Is cake cutting or plating included?', appears: 'quote', trigger: 'always' },
    { id: 'transport-parking', label: 'Transport, parking and shuttles', ask: 'What parking, transport or shuttle costs should we allow?', appears: 'day-of', trigger: 'always' },
    { id: 'wet-weather', label: 'Wet-weather backup', ask: 'What does the wet-weather backup include and cost?', appears: 'quote', trigger: 'outdoor' },
    { id: 'weather-equipment', label: 'Flooring, heating, fans or a generator', ask: 'Which weather equipment is included in the backup plan?', appears: 'quote', trigger: 'outdoor' },
    { id: 'travel-delivery', label: 'Vendor travel and delivery', ask: 'What travel and delivery fees apply to our location?', appears: 'quote', trigger: 'regional' },
    { id: 'accommodation', label: 'Accommodation for the couple or vendors', ask: 'Does the location create any accommodation requirement?', appears: 'invoice', trigger: 'regional' },
    { id: 'bar-minimum', label: 'Bar minimum or tab limit', ask: 'Is there a minimum bar spend or a hard tab limit?', appears: 'quote', trigger: 'open_drinks' },
    { id: 'corkage', label: 'Corkage and service for BYO drinks', ask: 'What corkage, glassware and service charges apply?', appears: 'quote', trigger: 'open_drinks' },
    { id: 'sunday-surcharge', label: 'Sunday or public-holiday surcharge', ask: 'Does our date attract a weekend or public-holiday surcharge?', appears: 'quote', trigger: 'sunday' },
    { id: 'staffing', label: 'Extra service staff and bump-in labour', ask: 'Does our guest count require extra staff or setup labour?', appears: 'quote', trigger: 'large' },
    { id: 'gifts-favours', label: 'Thank-you gifts and guest favours', ask: 'Have we deliberately included or excluded gifts and favours?', appears: 'invoice', trigger: 'always' }
  ]);
})(window);
