"""Hand-written records for the five celebrants the user named on 2026-11-23.

Prose is written in OmnyID's own words. Only contact details (phone, email, URL, social)
are copied, and each was read from the celebrant's own site (emails and social links were
re-checked in raw page HTML on 2026-11-23).

Four of the five already exist as register-only rows in the staged AG-register batch
(celebrants-nsw-register-import-2026-11-18), keyed by `celebrant-<first>-<last>`. Their phone
numbers match the celebrant's own site, which is how identity was confirmed. They become blank-fill
ADDITIONS. The fifth (Pauline) is a NEW record.
"""

CHECKED = "2026-11-23"

ADDITIONS = [
    {
        "vendor_id": "celebrant-nicole-webster",
        "name": "Nicole Webster",
        "trading_name": "Nicole The Celebrant",
        "source_url": "https://nicolethecelebrant.com.au/",
        "service_area_extra": "Eastern Suburbs, Inner West, North Shore, Northern Beaches and Sydney CBD; "
                              "travels further on request",
        "fill": {
            "website_url": "https://nicolethecelebrant.com.au/",
            "contact_email": "nicole@nicolethecelebrant.com.au",
            "instagram_url": "https://instagram.com/nicolethecelebrant",
            "facebook_url": "https://facebook.com/nicolethecelebrant",
        },
        "services": ["wedding", "legals only", "vow renewal", "commitment ceremony", "naming ceremony", "mc"],
        "price": None,
        "price_note": "No fees published. The only figure on the site is a $70 optional NSW certificate "
                      "application fee.",
        "years": 25,
        "years_note": "Site says 'Est. 2001' and '25+ years' on the homepage but 'over 20 years' on the "
                      "About page; 25 follows the founding year.",
        "cultures": ["LGBTQ+ couples", "multicultural couples"],
        "tags": ["celebrant", "personalised ceremonies", "legals only", "elopements", "vow renewals",
                 "naming ceremonies", "MC", "Eastern Suburbs", "Sydney", "harbour and coastal settings",
                 "LGBTQ+ friendly", "calm and warm"],
        "summary": "Eastern Suburbs celebrant based in Kingsford who says she has been marrying couples since "
                   "2001. Offers full personalised weddings, a legals-only service, vow renewals, commitment "
                   "and naming ceremonies and reception MC work, with coastal, harbour and garden settings "
                   "mentioned. Travels across metropolitan Sydney and further when asked. Fees are not "
                   "published; the site promises a personal reply within a day.",
        "flags": ["price_not_published", "years_claim_conflict_20_vs_25", "elopement_named_in_meta_only",
                  "pricing_and_faq_pages_not_found", "register_phone_match_confirmed"],
    },
    {
        "vendor_id": "celebrant-amanda-knapton",
        "name": "Amanda Knapton",
        "trading_name": "A Celebration Day",
        "source_url": "https://acelebrationday.com.au/weddings-marriage-celebrant/",
        "service_area_extra": "Sutherland Shire and South Coast; travels across Sydney",
        "fill": {
            "website_url": "https://acelebrationday.com.au/",
            "contact_email": "amanda@acelebrationday.com.au",
            "instagram_url": "https://www.instagram.com/amandaknapton_celebrant/",
            "facebook_url": "https://www.facebook.com/ACelebrationDay",
        },
        "services": ["wedding", "legals only", "elopement", "styled wedding package"],
        "price": 750,
        "price_status": "known",
        "price_note": "Legals-only 'from' price, Mon-Thu. Elopement $2,080 Mon-Thu / $2,300 Fri-Sun; mini "
                      "styled $3,710 / $4,270; maxi $6,020 / $6,670; designer $9,010 / $9,750. Packages "
                      "bundle a photographer and florals from partner suppliers.",
        "years": 18,
        "years_note": "Became a celebrant in 2008, so about 18 years in 2026.",
        "cultures": [],
        "tags": ["celebrant", "personalised ceremonies", "legals only", "elopements", "styled weddings",
                 "photographer included", "Sutherland Shire", "South Coast", "Sydney", "relaxed",
                 "funny and heartfelt", "package pricing"],
        "summary": "Sutherland Shire celebrant, qualified in 2008, who describes her ceremonies as relaxed, "
                   "funny and heartfelt. Sells tiered packages: a legals-only ceremony in her home studio, a "
                   "four-person elopement with a photographer, and mini, maxi and designer weddings that "
                   "add florals, cake, styling and photography through partner suppliers. Prices are "
                   "starting figures with a weekday and weekend split.",
        "flags": ["placeholder_lorem_ipsum_text_on_site", "elopement_page_password_notice_but_readable",
                  "award_finalist_claim_unverified", "deposit_and_cancellation_terms_not_found",
                  "register_phone_match_confirmed"],
    },
    {
        "vendor_id": "celebrant-jordan-vassallo",
        "name": "Jordan Vassallo",
        "trading_name": "Jordan Vassallo Celebrant",
        "source_url": "https://www.jordanvassallocelebrant.com.au/packages",
        "service_area_extra": "Sydney metro (travel included in the Signature and Wingman packages)",
        "fill": {
            "website_url": "https://www.jordanvassallocelebrant.com.au/",
            "contact_email": "info@jordanvassallocelebrant.com.au",
            "instagram_url": "https://www.instagram.com/jordanvassallocelebrant",
            "facebook_url": "https://www.facebook.com/jordanvassallocelebrant",
        },
        "services": ["wedding", "legals only", "mc"],
        "price": None,
        "price_note": "No fees published; each package has an enquiry button. A planning add-on is "
                      "described as worth $350 but no price is shown for it standalone.",
        "years": None,
        "years_note": "Site cites more than 20 years in theatre, not as a celebrant, so none is stored.",
        "cultures": [],
        "tags": ["celebrant", "bespoke ceremonies", "legals only", "MC", "celebrant and MC bundle",
                 "theatre background", "storytelling", "humour", "Sydney metro", "relaxed", "online planning",
                 "weekday legals"],
        "summary": "Sydney metro celebrant with a theatre background of more than twenty years as actor, "
                   "director and producer, by the celebrant's own account. Pitches a warm, unscripted, "
                   "humorous style. Four packages: a weekday legals-only ceremony, a personalised essentials "
                   "tier, a bespoke tier with unlimited planning meetings, and a bundle that adds a "
                   "reception MC for up to three and a half hours. Fees are not published.",
        "flags": ["price_not_published", "awards_claims_unverified_no_issuer_named",
                  "reality_tv_recognition_claim_not_stored", "register_suburb_box_hill_vs_site_sydney_metro",
                  "only_two_site_pages_read", "register_phone_match_confirmed"],
    },
    {
        "vendor_id": "celebrant-cerys-rhian-murphy",
        "name": "Cerys Rhian Murphy",
        "trading_name": "Married By Cerys",
        "source_url": "https://marriedbycerys.com/services",
        "service_area_extra": "Illawarra and NSW South Coast; Southern Highlands, Blue Mountains and Sydney "
                              "by arrangement",
        "fill": {
            "website_url": "https://marriedbycerys.com/",
            "contact_email": "marriedbycerys@gmail.com",
            "instagram_url": "https://www.instagram.com/marriedbycerys",
        },
        "services": ["wedding", "elopement", "mc"],
        "price": None,
        "price_note": "No fees published. Planning starts with a coffee or call and a questionnaire.",
        "years": None,
        "years_note": "Not stated on the site.",
        "cultures": [],
        "tags": ["celebrant", "bespoke ceremonies", "elopements", "MC", "Illawarra", "South Coast",
                 "Southern Highlands", "Wollongong", "high energy", "emotional and funny",
                 "performance background", "no templates"],
        "summary": "Illawarra-based celebrant, listed on the register at Shellharbour, who travels across the "
                   "South Coast, Southern Highlands, Blue Mountains and Sydney. Writes each ceremony from "
                   "scratch in a high-energy, emotional and funny voice, drawing on a performance and creative "
                   "writing background. Offers a wedding ceremony, a ceremony plus reception MC, and a "
                   "ten-minute elopement with signing table and arbour. Fees are not published.",
        "flags": ["price_not_published", "surname_from_register_only", "award_third_place_claim_unverified",
                  "contact_page_content_not_rendered", "contact_email_is_gmail", "register_phone_match_confirmed"],
    },
]

NEW = [
    {
        "slug": "pauline-appiah-dwyer",
        "name": "Pauline Appiah-Dwyer",
        "trading_name": "Your Memorable Moment",
        "sort_key": "appiah dwyer, pauline",
        "area": "Western Sydney NSW",
        "website": "https://yourmemorablemoment.com.au/",
        "phone": None,
        "email": "pauline@yourmemorablemoment.com.au",
        "form": "https://yourmemorablemoment.com.au/contact",
        "ig": "https://www.instagram.com/yourmemorablemoment/",
        "price": 350,
        "price_status": "known",
        "price_note": "Legals only $350; co-presented ceremony (a friend or relative 'marries' you) $450; "
                      "tailor-made $850. $150 non-refundable deposit within 7 days, balance 14 days before. "
                      "Reception MC and long-distance travel are add-ons priced on request.",
        "services": ["wedding", "legals only", "vow renewal", "naming ceremony", "milestone birthday", "mc"],
        "cultures": ["multicultural couples", "spiritual ceremonies"],
        "tags": ["celebrant", "Western Sydney", "Sydney", "multicultural ceremonies", "spiritual ceremonies",
                 "legals only", "co-presented ceremony", "vow renewals", "baby naming", "milestone birthdays",
                 "MC", "published pricing"],
        "summary": "Western Sydney celebrant who travels for weddings, vow renewals, baby naming ceremonies and "
                   "milestone birthdays, and says ceremonies can be classic, modern, multicultural or "
                   "spiritual. Wedding fees are published in three tiers: legals only, a co-presented "
                   "ceremony where a friend or relative leads, and a fully tailor-made one. A deposit holds "
                   "the date and the balance falls due two weeks out. Reception MC and extra travel are "
                   "priced on request.",
        "flags": ["needs_phone_lookup", "register_listing_not_matched", "area_wording_differs_western_vs_sydney",
                  "travel_threshold_conflict_150_vs_200km", "celebrants_network_membership_claim_unverified",
                  "register_number_not_published", "suburb_not_stated"],
        "src": "https://yourmemorablemoment.com.au/sample-page/",
    },
]
