# OmnyID Open-Source Release Plan

## Files And Directories To Include In The Final `OmnyID` Repository

Only the self-hostable AFP core should ship in the public repo.

```text
OmnyID/
  .github/
    workflows/
      ci.yml
  docker/
    caddy/
      Caddyfile.example
    compose/
      docker-compose.yml
  docs/
    examples/
      python/
        basic_send.py
        discovery.py
      typescript/
        basic-send.ts
        discovery.ts
    protocol/
      AFP_V1_SPEC.md
      AFP_MESSAGE_SHAPES.md
      AGENT_ID_SPEC.md
      AGENTCARD_DISCOVERY.md
      E2EE_AND_SIGNING.md
    self-hosting/
      QUICKSTART.md
      ELECTRIC_POSTGRES_SETUP.md
  homeserver/
    Cargo.toml
    build.rs
    src/
      agent_id.rs
      agentcard.rs
      crypto.rs
      db.rs
      federation.rs
      integration.rs
      lib.rs
      local_sync.rs
      message.rs
      relay.rs
      server.rs
      gateway/
        mod.rs
      bin/
        omnyid_keys.rs
        omnyid_wt_cert.rs
  installer/
    install-omnyid.sh
    install-omnyid.ps1
  postgres/
    init.sql
    migrations/
      0001_init.sql
      0002_workflow_state.sql
      0012_sync_device_policies.sql
      0015_peer_key_cache.sql
      0021_capability_registry.sql
      0024_aliases.sql
      0025_agent_preferences.sql
      0026_message_taxonomy.sql
  proto/
    afp.proto
  python-sdk/
    pyproject.toml
    afp/
      __init__.py
      client.py
      init.py
    tests/
      test_phase4_masteragent.py
  scripts/
    omnyid-dev-keys.ps1
    setup-python-sdk.ps1
    setup-webtransport-dev-cert.ps1
  typescript-sdk/
    package.json
    tsconfig.json
    src/
      index.ts
      workflows.ts
      libsodium-wrappers.d.ts
  .env.example
  .gitignore
  Apache-2.0 LICENSE
  README.md
```

## Files And Directories To Exclude From The Public Repo

The following current areas should not ship in the open-source core:

- `solid-ui/`
- `ui/`
- `app/`
- `runtime-templates/`
- `service-adapter-templates/`
- `docs/index.html`
- `docs/app.js`
- `Documents/deployment/`
- `Documents/marketing/`
- `Documents/strategy/`
- `docker-compose.oracle.yml`
- `docker-compose.oracle.quic.yml`
- `docker-compose.oracle.minimal.yml`
- `oracle-cloud.env.example`
- `oracle-cloud.quic.env.example`
- `oracle-cloud.local.env`
- `Caddyfile`
- `scripts/deploy-oracle.ps1`
- `scripts/oracle-ssh.ps1`
- `scripts/oracle-renew-wt-cert.sh`
- `scripts/oracle-config.local.ps1.example`
- `scripts/install-omnyid-private.sh`
- `scripts/install-omnyid-private.ps1`
- `scripts/get-gmail-token.py`
- `conversation summary.docx`
- `conversation with Grok.docx`
- `key details document from conversation with Grok.docx`
- `Agenton.pptx`
- `Pre Release checklist.txt`
- any local `.env` or host-specific files
- any generated certificates, secrets, tokens, backups, or private notes

## Step-By-Step Sanitisation And Publishing Checklist

1. Create a fresh public repo root named `OmnyID` instead of publishing the current private repo in place.
2. Copy only the allowlisted core directories listed above into the new repo.
3. Rename the Rust package root into `homeserver/` so the public repo has a clear product boundary.
4. Remove every hosted-only or premium UI surface:
   - `solid-ui/`
   - `ui/`
   - `app/`
   - workflow-builder plans and premium design assets
5. Remove every cloud-only deployment artifact:
   - Oracle compose files
   - cloud env examples
   - Oracle scripts
   - private install scripts aimed at managed hosting
6. Remove private documents, office files, and internal conversations.
7. Replace all real domains with `example.com`.
8. Replace all real API hosts with `https://example.com`.
9. Replace all real AFP delegation hosts with `example.com:443`.
10. Replace all real Agent IDs with dummy values such as `agent:ed25519-0000000000000000000000000000000000000000000000000000000000000000@example.com`.
11. Replace all real email addresses with `you@example.com` or `admin@example.com`.
12. Remove all real OAuth client IDs, secrets, refresh tokens, and provider credentials from examples and scripts.
13. Remove or comment out cloud-specific environment variables such as:
    - `OMNYID_HOSTING_PRIMARY`
    - `OMNYID_HOSTING_SECONDARY`
    - Oracle, OVHcloud, or managed-host references
14. Remove all waitlist, billing, support-access, session-control, and hosted runtime references from public docs and examples.
15. Remove all premium workflow-builder and enterprise wording from specs and comments.
16. Sanitize code defaults that currently hardcode `omnyid.com`, `api.omnyid.com`, or `wt.omnyid.com`.
17. Sanitize WebAuthn defaults to use `example.com` placeholders in docs and sample env files.
18. Sanitize SDK host-rewrite helpers so examples point to user-provided domains rather than OmnyID-operated infrastructure.
19. Keep only self-hosting-safe compose defaults:
    - local Postgres
    - local Electric
    - local homeserver
    - optional Caddy reverse proxy
20. Convert the top-level `Caddyfile` into `docker/caddy/Caddyfile.example` with placeholder domains.
21. Rewrite `.env.example` so it contains placeholders only and no real IDs.
22. Remove generated package metadata that should not be versioned in the new repo:
    - `python-sdk/afp.egg-info/`
    - frontend `node_modules/`
    - any local build output
23. Update SDK package metadata to Apache-2.0 and point repository URLs to the new public repo.
24. Update the homeserver crate metadata to Apache-2.0.
25. Replace the current top-level README with the sanitized public README below.
26. Add Apache-2.0 as the top-level license for the whole repository.
27. Add a short `docs/protocol/AFP_V1_SPEC.md` index that links the protocol and discovery documents retained from the private repo.
28. Verify the public tree contains no `omnyid.com`, `api.omnyid.com`, `wt.omnyid.com`, Oracle, OVHcloud, Grok, or conversation artifacts:
    - `rg -n "omnyid\\.com|api\\.omnyid\\.com|wt\\.omnyid\\.com|oracle|ovhcloud|runpod|googleusercontent|refresh_token|BEGIN .*PRIVATE KEY|Grok|conversation" .`
29. Verify no secrets are present:
    - `rg -n "CLIENT_SECRET|REFRESH_TOKEN|PRIVATE KEY|SIGNING_KEY_HEX=|ENCRYPTION_KEY_HEX=|PASSWORD=" .`
30. Verify the release boots locally:
    - `docker compose up --build`
    - `cargo test`
    - Python SDK example
    - TypeScript SDK build
31. Review the final public repo as if it were a first-time self-hoster:
    - one command to start
    - one env example to edit
    - one quick start path
32. Tag the first public release only after the sanitized repo passes the above checks.

## Required `.gitignore` Updates

Use the following top-level `.gitignore` in the public repo:

```gitignore
# OS / editors
.DS_Store
Thumbs.db
.idea/
.vscode/
*.swp
*.swo

# Temporary files
~$*
~WRL*.tmp
*.tmp

# Node / frontend
node_modules/
dist/
build/
coverage/
*.tsbuildinfo

# Python
__pycache__/
*.pyc
.pytest_cache/
.mypy_cache/
.ruff_cache/
.venv/
venv/
env/
*.egg-info/

# Rust
target/

# Local env
.env
.env.*
!.env.example

# Secrets / local certificates
secrets/
*.pem
*.key
*.crt
*.p12
*.pfx
id_ed25519*
id_rsa*

# Local data and backups
*.log
*.sqlite
*.db
backups/
tmp/
```

## Top-Level `README.md`

Use the following exact content for the public repository README:

```md
# OmnyID

OmnyID is an open-source, self-hosted private agent infrastructure stack built around AFP v1, an append-only protocol for signed, encrypted agent messaging.

The public core includes:

- the AFP v1 protocol specification and message schema
- a Rust homeserver built with Tokio, Axum, gRPC, WebTransport, and WebSocket fallback
- Postgres plus ElectricSQL setup for local-first sync with per-user schema boundaries
- Python and TypeScript SDKs
- AgentCard discovery and alias resolution
- AFP signing, encryption, validation, and relay handling
- Docker Compose for self-hosting

OmnyID is designed for developers who want to run private agent infrastructure on their own machine or server, inspect the full protocol, and contribute to an open implementation.

## Why OmnyID

- self-host first: the default path is local development and self-hosted deployment
- protocol first: AFP v1 is documented in this repository
- encrypted by design: signed messages, encrypted envelopes, and validation hooks are part of the core
- multi-language: official Rust, Python, and TypeScript surfaces ship together
- local-first ready: ElectricSQL and Postgres are included for sync-oriented deployments

## Repository Layout

- `proto/` AFP v1 protobuf contract
- `docs/protocol/` protocol and discovery specifications
- `homeserver/` Rust reference homeserver
- `postgres/` database bootstrap and migrations
- `python-sdk/` AFP Python SDK
- `typescript-sdk/` AFP TypeScript SDK
- `docker/compose/` self-hosting stack
- `installer/` one-command setup scripts

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/omnyid/omnyid.git
cd omnyid
```

### 2. Copy the environment template

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 3. Generate local development keys

```powershell
powershell -ExecutionPolicy Bypass -File scripts/omnyid-dev-keys.ps1
```

Paste the generated placeholder-safe values into `.env`.

### 4. Start the stack

```bash
docker compose -f docker/compose/docker-compose.yml up --build
```

This starts:

- Postgres
- ElectricSQL
- the OmnyID homeserver
- an optional local reverse proxy

### 5. Verify the server

Open:

- `http://localhost:8080/healthz`
- `http://localhost:8080/readyz`

## Self-Hosting Notes

- OmnyID ships with placeholder domains only. Replace them with your own hostname when deploying outside local development.
- The public repository does not include managed cloud infrastructure, hosted control-plane features, or premium UI surfaces.
- Email gateway integrations are optional and should be configured only with your own credentials.

## SDKs

### Python

```bash
cd python-sdk
python -m venv .venv
. .venv/bin/activate
pip install -e .
python ../docs/examples/python/basic_send.py
```

### TypeScript

```bash
cd typescript-sdk
npm install
npm run build
node ../docs/examples/typescript/basic-send.ts
```

## Protocol Docs

Start here if you want to understand or extend AFP v1:

- `docs/protocol/AFP_V1_SPEC.md`
- `docs/protocol/AFP_MESSAGE_SHAPES.md`
- `docs/protocol/AGENT_ID_SPEC.md`
- `docs/protocol/AGENTCARD_DISCOVERY.md`
- `docs/protocol/E2EE_AND_SIGNING.md`

## Development

### Rust

```bash
cd homeserver
cargo test
```

### Python SDK

```bash
cd python-sdk
pytest
```

### TypeScript SDK

```bash
cd typescript-sdk
npm run typecheck
```

## Security And Sanitisation

- all public examples use placeholder domains and dummy Agent IDs
- no production secrets, hosted credentials, or cloud-only infrastructure are included
- the repository is intended for self-hosting and local development

If you discover a security issue, please open a private security report with enough detail to reproduce the problem safely.

## Contributing

Issues, protocol discussions, SDK improvements, and self-hosting fixes are welcome.

If you are contributing a protocol change, update the docs in `docs/protocol/` and keep the Rust, Python, and TypeScript implementations aligned.

## License

Apache License 2.0. See `LICENSE`.
```

## Apache-2.0 `LICENSE`

Use the standard Apache License 2.0 text below as the top-level `LICENSE` file:

```text
Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/

TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

1. Definitions.

"License" shall mean the terms and conditions for use, reproduction, and
distribution as defined by Sections 1 through 9 of this document.

"Licensor" shall mean the copyright owner or entity authorized by the copyright
owner that is granting the License.

"Legal Entity" shall mean the union of the acting entity and all other entities
that control, are controlled by, or are under common control with that entity.
For the purposes of this definition, "control" means (i) the power, direct or
indirect, to cause the direction or management of such entity, whether by
contract or otherwise, or (ii) ownership of fifty percent (50%) or more of the
outstanding shares, or (iii) beneficial ownership of such entity.

"You" (or "Your") shall mean an individual or Legal Entity exercising
permissions granted by this License.

"Source" form shall mean the preferred form for making modifications, including
but not limited to software source code, documentation source, and configuration
files.

"Object" form shall mean any form resulting from mechanical transformation or
translation of a Source form, including but not limited to compiled object code,
generated documentation, and conversions to other media types.

"Work" shall mean the work of authorship, whether in Source or Object form, made
available under the License, as indicated by a copyright notice that is
included in or attached to the work.

"Derivative Works" shall mean any work, whether in Source or Object form, that
is based on (or derived from) the Work and for which the editorial revisions,
annotations, elaborations, or other modifications represent, as a whole, an
original work of authorship. For the purposes of this License, Derivative Works
shall not include works that remain separable from, or merely link (or bind by
name) to the interfaces of, the Work and Derivative Works thereof.

"Contribution" shall mean any work of authorship, including the original version
of the Work and any modifications or additions to that Work or Derivative Works
thereof, that is intentionally submitted to Licensor for inclusion in the Work
by the copyright owner or by an individual or Legal Entity authorized to submit
on behalf of the copyright owner. For the purposes of this definition,
"submitted" means any form of electronic, verbal, or written communication sent
to the Licensor or its representatives, including but not limited to
communication on electronic mailing lists, source code control systems, and
issue tracking systems that are managed by, or on behalf of, the Licensor for
the purpose of discussing and improving the Work, but excluding communication
that is conspicuously marked or otherwise designated in writing by the copyright
owner as "Not a Contribution."

"Contributor" shall mean Licensor and any individual or Legal Entity on behalf
of whom a Contribution has been received by Licensor and subsequently
incorporated within the Work.

2. Grant of Copyright License. Subject to the terms and conditions of this
License, each Contributor hereby grants to You a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, irrevocable copyright license to
reproduce, prepare Derivative Works of, publicly display, publicly perform,
sublicense, and distribute the Work and such Derivative Works in Source or
Object form.

3. Grant of Patent License. Subject to the terms and conditions of this
License, each Contributor hereby grants to You a perpetual, worldwide,
non-exclusive, no-charge, royalty-free, irrevocable (except as stated in this
section) patent license to make, have made, use, offer to sell, sell, import,
and otherwise transfer the Work, where such license applies only to those
patent claims licensable by such Contributor that are necessarily infringed by
their Contribution(s) alone or by combination of their Contribution(s) with the
Work to which such Contribution(s) was submitted. If You institute patent
litigation against any entity (including a cross-claim or counterclaim in a
lawsuit) alleging that the Work or a Contribution incorporated within the Work
constitutes direct or contributory patent infringement, then any patent licenses
granted to You under this License for that Work shall terminate as of the date
such litigation is filed.

4. Redistribution. You may reproduce and distribute copies of the Work or
Derivative Works thereof in any medium, with or without modifications, and in
Source or Object form, provided that You meet the following conditions:

(a) You must give any other recipients of the Work or Derivative Works a copy of
this License; and

(b) You must cause any modified files to carry prominent notices stating that
You changed the files; and

(c) You must retain, in the Source form of any Derivative Works that You
distribute, all copyright, patent, trademark, and attribution notices from the
Source form of the Work, excluding those notices that do not pertain to any part
of the Derivative Works; and

(d) If the Work includes a "NOTICE" text file as part of its distribution, then
any Derivative Works that You distribute must include a readable copy of the
attribution notices contained within such NOTICE file, excluding those notices
that do not pertain to any part of the Derivative Works, in at least one of the
following places: within a NOTICE text file distributed as part of the
Derivative Works; within the Source form or documentation, if provided along
with the Derivative Works; or, within a display generated by the Derivative
Works, if and wherever such third-party notices normally appear. The contents of
the NOTICE file are for informational purposes only and do not modify the
License. You may add Your own attribution notices within Derivative Works that
You distribute, alongside or as an addendum to the NOTICE text from the Work,
provided that such additional attribution notices cannot be construed as
modifying the License.

You may add Your own copyright statement to Your modifications and may provide
additional or different license terms and conditions for use, reproduction, or
distribution of Your modifications, or for any such Derivative Works as a whole,
provided Your use, reproduction, and distribution of the Work otherwise complies
with the conditions stated in this License.

5. Submission of Contributions. Unless You explicitly state otherwise, any
Contribution intentionally submitted for inclusion in the Work by You to the
Licensor shall be under the terms and conditions of this License, without any
additional terms or conditions. Notwithstanding the above, nothing herein shall
supersede or modify the terms of any separate license agreement you may have
executed with Licensor regarding such Contributions.

6. Trademarks. This License does not grant permission to use the trade names,
trademarks, service marks, or product names of the Licensor, except as required
for reasonable and customary use in describing the origin of the Work and
reproducing the content of the NOTICE file.

7. Disclaimer of Warranty. Unless required by applicable law or agreed to in
writing, Licensor provides the Work (and each Contributor provides its
Contributions) on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied, including, without limitation, any warranties
or conditions of TITLE, NON-INFRINGEMENT, MERCHANTABILITY, or FITNESS FOR A
PARTICULAR PURPOSE. You are solely responsible for determining the
appropriateness of using or redistributing the Work and assume any risks
associated with Your exercise of permissions under this License.

8. Limitation of Liability. In no event and under no legal theory, whether in
tort (including negligence), contract, or otherwise, unless required by
applicable law (such as deliberate and grossly negligent acts) or agreed to in
writing, shall any Contributor be liable to You for damages, including any
direct, indirect, special, incidental, or consequential damages of any
character arising as a result of this License or out of the use or inability to
use the Work (including but not limited to damages for loss of goodwill, work
stoppage, computer failure or malfunction, or any and all other commercial
damages or losses), even if such Contributor has been advised of the possibility
of such damages.

9. Accepting Warranty or Additional Liability. While redistributing the Work or
Derivative Works thereof, You may choose to offer, and charge a fee for,
acceptance of support, warranty, indemnity, or other liability obligations
and/or rights consistent with this License. However, in accepting such
obligations, You may act only on Your own behalf and on Your sole responsibility,
not on behalf of any other Contributor, and only if You agree to indemnify,
defend, and hold each Contributor harmless for any liability incurred by, or
claims asserted against, such Contributor by reason of your accepting any such
warranty or additional liability.

END OF TERMS AND CONDITIONS
```

## Repo-Specific Notes From The Current Private Tree

The current private repo contains publish blockers that should be scrubbed before copying code into the public tree:

- `.env.example` contains real `omnyid.com` domains and a real Google OAuth client ID.
- `docs/app.js`, `solid-ui/`, and parts of `src/server.rs` contain hosted-product, billing, support-access, and managed-runtime references.
- `oracle-cloud.local.env` must never be published.
- `scripts/get-gmail-token.py` is private-ops tooling and should not ship.
- `python-sdk/pyproject.toml` and `typescript-sdk/package.json` currently declare `MIT`; update both to Apache-2.0 in the public repo.
- `python-sdk/afp.egg-info/` is generated metadata and should be removed from version control.
