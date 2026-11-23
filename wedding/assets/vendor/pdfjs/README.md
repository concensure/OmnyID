# PDF.js public quote reader

This directory vendors the two minified runtime files required to extract text
from selectable-text PDFs on the no-login Wedding quote comparison page.

- Package: `pdfjs-dist` 6.0.227 (already pinned by `solid-ui/package.json` and
  `package-lock.json`)
- Upstream: Mozilla PDF.js
- License: Apache-2.0; see `LICENSE`
- Runtime boundary: same-origin, browser-only text extraction. Quote bytes and
  extracted text are not uploaded by selecting a file.

Refresh these files from `solid-ui/node_modules/pdfjs-dist/build/` when the
pinned dependency changes; do not edit the minified bundles by hand.
