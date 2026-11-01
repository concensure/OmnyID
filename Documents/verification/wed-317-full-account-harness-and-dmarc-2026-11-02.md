# WED-317 full-account harness and outbound DMARC record

Date: 2026-11-02 (Australia/Sydney)

## Harness boundary

The disposable harness joins the production homeserver entry point, the production-built Solid UI,
and a tmpfs pgvector database. It never uses a production account, database, email address, provider,
or send credential.

- Entrypoint: `scripts/e2e-wedding-stack.ps1`
- Database: random loopback port, exact database name `omnyid_test`, tmpfs data directory
- Accounts: only `@omnyid.test`, created through the real `/auth/register` route
- Verification: the guarded local seeder marks only those synthetic rows verified after registration
- UI: built with the normal Vite production build and served through Vite preview
- Browser: separate Playwright contexts for Mia, Jordan, Priya, Sam and Alex
- External effects: transactional email, vendor mail, Email Worker, gRPC, WebTransport and run-sheet
  sharing remain disabled
- Teardown: browser/server processes and the exact named container are removed in `finally`

The deterministic journeys exercise request submit and withdrawal, a protected helper scope, Alex's
catering-only household scope, delegated proposal, owner approval, revocation, and cross-couple grant
identifier substitution. The test also proves that the restricted household and private marker are
absent from Alex's projection.

## Live email authentication observation

Public DNS was read on 2026-11-02 without changing provider state:

- `_dmarc.omnyid.com`: `v=DMARC1; p=reject;`
- `omnyid.com` SPF: `v=spf1 include:_spf.mx.cloudflare.net ~all`
- MX: Cloudflare Email Routing
- `cf2024-1._domainkey.omnyid.com`: a Cloudflare DKIM public key exists
- common Google DKIM selector `google._domainkey.omnyid.com`: no record found

The rejection of a Gmail UI message claiming `From: hello@omnyid.com` is therefore expected. Adding
`hello@omnyid.com` to Cloudflare Email Routing configures inbound receipt. It does not make Gmail an
authorised outbound sender. The observed SPF record authorises Cloudflare's domain mail path, not
Google, and no Google DKIM selector signs as `omnyid.com`. A Gmail or `gmail.com` signature is not
aligned with the visible `omnyid.com` From domain, so the domain's correct `p=reject` policy rejects it.

## Safe resolution

Do not relax DMARC and do not add a second SPF TXT record.

For application and transactional mail, use the already implemented Cloudflare Email Sending path
with the account-level sending token, Cloudflare account ID and `hello@omnyid.com`. Capture provider
acceptance and a real received-message header showing aligned SPF or DKIM before calling it working.

For manually composing mail in the Gmail UI, choose one authenticated outbound system:

1. Google Workspace for `omnyid.com`: generate the DKIM record in the Google Admin console, publish
   that exact selector/value, start DKIM authentication, and merge `include:_spf.google.com` into the
   one existing SPF record; or
2. an SMTP provider that has verified `omnyid.com`: configure Gmail's "Send mail as" entry to use that
   provider's SMTP credentials and publish only the provider-supplied SPF/DKIM records.

The current DNS evidence is insufficient for either Gmail option. No DNS mutation is justified until
the chosen provider supplies the exact DKIM selector/key and the received original can be checked for
`spf=pass`, `dkim=pass` and `dmarc=pass` with an aligned `omnyid.com` identity.

Authoritative references:

- Google Workspace Admin Help, "Set up DKIM": `https://support.google.com/a/answer/174124`
- Google Workspace Admin Help, "Set up SPF": `https://support.google.com/a/answer/1068501`
- Cloudflare Email Routing, "Email Routing DNS records":
  `https://developers.cloudflare.com/email-routing/setup/email-routing-dns-records/`
