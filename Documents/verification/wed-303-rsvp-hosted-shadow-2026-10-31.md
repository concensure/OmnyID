# WED-303 RSVP hosted shadow and restore evidence

Date: 2026-10-31 (Australia/Sydney)

## Release identity

- RSVP application implementation: `eff62d1c44d3140d9fa2edae04cc4cbfcd65ba21`
- Hosted CSP/config and static release: `65b12a3a3d764b560b9e95948df1e201c9eb7472`
- Clean release worktree:
  `C:\Users\ozans\AppData\Local\Temp\omnyid-wed303-release-65b12a3`
- Production Caddyfile SHA-256:
  `3d2f11404fcc64dbdbb949cf1cc5a1665829faf115e5b5c9676938a9cb26da09`
- The production and clean-candidate Caddyfile hashes match.

The homeserver implementation did not change after `eff62d1`; the `65b12a3`
release updates the static workspace and Caddy policy only. Simulated data was
excluded.

## Hosted guest shadow

The deployed `/workspace/rsvp.html` was exercised with network-intercepted
capability open/respond fixtures. This tested the hosted production assets but
did not create a production capability, AFP response or provider send.

Six scenarios passed:

1. two named guests accept at 320 CSS pixels;
2. the same flow passes at 375 CSS pixels;
3. the same flow passes at 1280 CSS pixels;
4. declining removes meal questions and validation returns focus to the first
   invalid attendance control;
5. the loading state remains announced, keyboard focus remains available and
   no horizontal overflow appears at 200% text zoom;
6. invalid and expired tokens use the same generic unavailable state and the
   URL fragment is removed.

Every accepting scenario moved focus to the review heading and then the receipt
heading. Axe reported no serious or critical violations. No page error or CSP
violation remained after the policy correction.

## CSP correction

The first hosted run found that the workspace's configured Atkinson
Hyperlegible stylesheet request was allowed by `style-src` but blocked by
`connect-src`. Commit `65b12a3` narrowly adds
`https://fonts.googleapis.com` to `connect-src` for the workspace and password
reset shells. It does not add script, frame, image or arbitrary network hosts.

Evidence:

- the production Caddy binary validated the candidate configuration;
- the Wedding site/security suite passed;
- the live workspace response contains the corrected CSP;
- the rerun reports zero CSP and page errors.

## Exact-candidate checks

- TypeScript typecheck: passed.
- Wedding tests: 2,089 passed.
- Both line-budget tests: passed.
- Wedding website/security/quiz/confirmation/blog suite: passed.
- Production UI build: passed.
- Production-binary Caddy validation: passed.
- Hosted RSVP Playwright: 6 passed.

## Oracle restore and flags-off evidence

The isolated restore drill completed successfully against the newest verified
archive. Backup manifest, Postgres archive and SeaweedFS mirror verification
passed. The drill reported `restore_drill_status=pass`, cleaned its temporary
container, and the root disk returned to 74% used with about 12 GB free.

Hosted checks after the Caddy-only release:

- `/workspace/`: HTTP 200;
- unauthenticated `/wedding/rsvp/reminders/status`: HTTP 401 from the protected
  backend;
- Caddy container: running;
- RSVP public flag: unset, default false;
- RSVP reminder provider-send flag: unset, default false;
- vendor mail, sender mask and ingress flags: false.

No invitation, capability, reminder or provider email was sent.

## Remaining controlled gates

- The hosted guest usability/accessibility half has evidence above.
- The authenticated couple-side scenario is not marked passed. The authorized
  test account returned HTTP 401 with its saved credential on 2026-10-31; no
  account data was changed and no password reset was initiated.
- The allowlisted production pilot remains off until a valid couple test
  session is available and the couple-side preview/approval path passes.
