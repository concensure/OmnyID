# Cloudflare Email Routing Setup for `omnyid.com`

Use this only if you want human-facing addresses like `admin@omnyid.com` or `you@omnyid.com` to forward into Gmail while OmnyID continues using Gmail OAuth for optional human inbox access.

It is not required for agent-to-agent communication.

## What To Change In Cloudflare

Delete these conflicting records from the DNS root `omnyid.com`:

- `MX omnyid.com 10 mail.omnyid.com.`
- `TXT omnyid.com "v=spf1 ip4:152.67.110.187 include:_spf.google.com ~all"`

Add these required Cloudflare Email Routing records:

- `MX omnyid.com 97 route1.mx.cloudflare.net.`
- `MX omnyid.com 73 route2.mx.cloudflare.net.`
- `MX omnyid.com 7 route3.mx.cloudflare.net.`
- `TXT cf2024-1._domainkey.omnyid.com "v=DKIM1; h=sha256; k=rsa; p=..."`
- `TXT omnyid.com "v=spf1 include:_spf.mx.cloudflare.net ~all"`

Do not delete unrelated web or relay records such as:

- `A api.omnyid.com`
- `A wt.omnyid.com`
- `A/AAAA/CNAME` records used for the website or agent relay

## Important Limitation

Cloudflare Email Routing is not a mailbox host.

It does:

- receive mail for `@omnyid.com`
- forward that mail to another inbox, such as Gmail

It does not:

- create a real IMAP inbox on Cloudflare
- store mailbox history for OmnyID to sync directly from Cloudflare
- replace a true mailbox provider

## Recommended OmnyID Launch Path

For the current OmnyID architecture, the simplest production-safe human inbox setup is:

1. Cloudflare Email Routing receives `@omnyid.com`
2. Mail forwards to the user's Gmail inbox
3. OmnyID connects to Gmail with OAuth
4. OmnyID ingests the forwarded mail from Gmail into AFP threads

That gives you a custom public human email identity without needing to run your own full mail server first.

Agent messaging is separate:

1. sender resolves recipient AgentCard
2. sender encrypts AFP to recipient public key
3. sender signs with sender private key
4. sender delivers to recipient homeserver over WebTransport or WebSocket fallback
5. recipient decrypts locally and verifies signature

## SPF / DKIM / Sending Note

The Cloudflare-required SPF record above is the right value while enabling Email Routing.

If you later want OmnyID to send outbound mail as `@omnyid.com`, you may need to revisit outbound authentication depending on the sender:

- Gmail sending as custom domain
- Oracle-hosted SMTP
- another SMTP provider

For launch, keep the Cloudflare Email Routing SPF record exactly as Cloudflare requires, then layer outbound DKIM/SPF alignment afterward.

## What To Do Right Now

1. Delete the conflicting root `MX` and `TXT` records shown by Cloudflare
2. Add the three Cloudflare `MX` records
3. Add the Cloudflare `TXT` SPF record
4. Add the Cloudflare DKIM `TXT` record
5. Create the forwarding rule in Cloudflare Email Routing to the Gmail inbox you want OmnyID to use
6. Keep using Gmail OAuth in OmnyID for the actual inbox access
