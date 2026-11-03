# WED-327 root-route audit

Date: 3 November 2026
Scope: public paths served by `docs/`, Caddy's root handlers and the generated sitemap.

## Canonical public root paths

These are deliberate indexable pages and are listed in `docs/sitemap.xml`:

| Path | Purpose | Decision |
| --- | --- | --- |
| `/` | OmnyID product home | Keep. Canonical is `/`; now includes a Wedding-couple use case. |
| `/privacy.html` | Privacy policy | Keep and self-canonicalise. |
| `/data-rights.html` | Access/deletion policy | Keep and self-canonicalise. |
| `/security.html` | Security and incident information | Keep and self-canonicalise. |
| `/terms.html` | Terms | Keep and self-canonicalise. |
| `/vendors.html` | Vendor acquisition page | Keep. Canonical and sitemap now both use `/vendors.html`. |
| `/robots.txt` | Crawler policy | Keep outside the sitemap. |
| `/sitemap.xml` | Public discovery index | Keep. Full source path is `C:\Users\ozans\Desktop\projects\OmnyID-WED-319\docs\sitemap.xml`. |
| `/.well-known/security.txt` | Security contact | Keep outside the sitemap. |

## Non-indexable and duplicate paths

| Path | Observed role | Action |
| --- | --- | --- |
| `/reset-password` | Workspace password-reset shell | Keep for email links; serve `X-Robots-Tag: noindex, nofollow`. |
| `/reset-password.html` | Static fallback form | Keep only while clients still reference it; its existing `noindex` must remain. Later consolidate on `/reset-password`. |
| `/verify-email.html` | One-time account confirmation result | Keep; its existing `noindex,nofollow` must remain. |
| `/index.html` | Duplicate of `/` | Redirect permanently to `/`. |
| `/docs/index.html` | Legacy duplicate of `/` | Redirect permanently to `/`. Existing Wedding links can follow the redirect safely. |
| `/docs/*` | Legacy alias of root static documents | Retain temporarily for old links, add `X-Robots-Tag: noindex, follow`, and rely on the direct page canonical. Remove after access logs show no meaningful use. |
| `/privacy`, `/data-rights`, `/security`, `/terms`, `/vendors` | Extensionless duplicates created by `try_files` | Redirect permanently to the matching canonical `.html` URL. |

## Unknown paths

Before this change, an arbitrary path such as `/this-route-should-not-exist-wed327` returned the root home page with HTTP 200. That was a soft-404 and made every mistyped root path appear valid to crawlers and models. The root fallback now resolves only a real file or its explicit `.html` equivalent; all other paths return HTTP 404.

Operational and API paths are intentionally absent from the sitemap. If production logs show a recurring unknown path, classify it before adding a route:

1. redirect it only when it is an old public URL with one unambiguous successor;
2. add a real page and self-canonical only when the content should rank;
3. retain `404` for typos, scanners and obsolete unpublished experiments; or
4. use `410 Gone` for a deliberately removed page that previously had external links.

## Verification after deployment

- `/this-route-should-not-exist-wed327` returns 404 rather than the home page.
- `/index.html` and `/docs/index.html` redirect to `/`.
- extensionless legal/vendor aliases redirect to the sitemap URL.
- transactional pages remain absent from the sitemap and expose `noindex`.
- every URL in `docs/sitemap.xml` has a matching self-referencing canonical.
