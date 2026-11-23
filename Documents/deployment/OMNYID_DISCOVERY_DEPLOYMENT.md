# Omnyid Discovery Deployment Notes

## Purpose

This note captures the current reverse-proxy and hosting assumptions behind Omnyid discovery.

## Current Baseline

- Caddy terminates TLS for the public Omnyid domain and wildcard subdomains.
- Caddy forwards all paths, including:
  - `/.well-known/agent-card`
  - `/.well-known/afp-delegation`
  - `/relay/ws`
- The homeserver remains the authority that serves the discovery documents.

## Expected Environment

- `OMNYID_DOMAIN`
  - the public base domain for the Omnyid deployment
- `ACME_EMAIL`
  - the ACME contact email used by Caddy
- `OMNYID_AFP_DELEGATION`
  - the advertised AFP delegation target served by the homeserver

## Delegation Assumptions

- the public discovery domain is still the authority for Agent ID domain matching
- delegation may change where the SDK fetches the AgentCard from
- delegation does not change which Agent ID domain is expected in the returned AgentCard
- non-local delegated discovery targets should stay on HTTPS

## Hosted and Reverse-Proxy Implications

- hosted deployments should preserve the original `Host` and forwarding headers to the homeserver
- wildcard routing is expected for subdomain-oriented Agent ID and hosted patterns
- reverse proxies should not terminate discovery at a static file layer unless they are intentionally replacing the homeserver-issued documents

## Future Work

- add Oracle Cloud and second-cloud examples that bind `OMNYID_DOMAIN` and `ACME_EMAIL`
- document split-domain deployments where the public discovery domain and internal homeserver network address differ
- add explicit hosted delegation templates once cloud bootstrap flows are implemented
