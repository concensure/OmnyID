# WED-355 verification — account isolation, Gmail alpha, lenses, and vendor discovery

## Account boundary

- Durable AFP/dashboard data continues to be selected through the authenticated tenant in the server routes and database layer; existing adversarial API tests cover cross-tenant reads and writes.
- Browser Wedding mirrors now add the authenticated user ID to shared starter plan/workspace keys. This covers task completion, budget drafts, wedding date, guests, helpers, decision selections, preference interpretation, selected tab, and AFP projection receipts.
- Unauthenticated quiz and lead-magnet handoffs deliberately remain origin-local until a signed-in user explicitly imports them; they are not treated as an authenticated ledger.
- New two-account tests prove that identical starter IDs do not share task progress, budget, date, selected tab, or projection receipts.

## Gmail alpha

- `gmail_alpha_access_requests` is account-owned and deleted with the user.
- The Email view explains the alpha boundary before any Google redirect.
- The request endpoint records the signed-in account and timestamp and sends those details, without mailbox content, to `admin@omnyid.com`.
- OAuth URL issuance and callback completion both fail closed unless the account status is `approved`.

## Role-aware lens

- Wedding entry and active Wedding primary use cases default to Wedding lens; the operator defaults to General.
- Wedding lens retains the breadcrumb, hides Master Agent/model setup chrome, and exposes Today, Guests, Plan, Budget, Vendors, Calendar, Database, Diary and an account-scoped Advanced view picker.
- Admin-only surfaces are excluded from that picker. Growth/admin and cost dashboards remain direct operator rail actions.
- The vendor claim entry continues to route to the dedicated vendor portal rather than the general workspace.

## Vendor discovery

- Status chips with zero records are not rendered.
- Primary categories are Venue, Planner, Photographer and Celebrant; the remainder are behind More/See all.
- Category constraints use canonical directory IDs without replacing the typed search phrase. Musician requests therefore match `band` listings such as Linda Dagher Music and Jessica Zammit.
- Smaller evidenced categories can render a comparison with fewer than three choices rather than falling back to unrelated search notes.
