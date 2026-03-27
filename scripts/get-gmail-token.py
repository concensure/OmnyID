"""
get-gmail-token.py
------------------
One-shot helper that completes the Gmail OAuth consent flow and prints a
refresh token you can paste into oracle-cloud.local.env as
OMNYID_GMAIL_REFRESH_TOKEN.

Usage (from repo root):
    python-sdk\\.venv\\Scripts\\python.exe scripts\\get-gmail-token.py

Requirements: only stdlib + the httpx that is already in the SDK venv.
The script starts a tiny HTTP server on http://localhost:3000 to receive the
OAuth callback (this URI must be in your Google Cloud Console authorized list).
"""

import http.server
import os
import sys
import threading
import urllib.parse
import urllib.request
import json
import webbrowser

CLIENT_ID     = os.environ.get("OMNYID_GMAIL_CLIENT_ID",
                "975613409177-nv214f97lors4g5j2dcvuftv5pf9c88p.apps.googleusercontent.com")
CLIENT_SECRET = os.environ.get("OMNYID_GMAIL_CLIENT_SECRET", "")
REDIRECT_URI  = "http://localhost:3000/auth/google/callback"
SCOPES        = " ".join([
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "openid",
    "email",
])
AUTH_URL      = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL     = "https://oauth2.googleapis.com/token"

if not CLIENT_SECRET:
    print(
        "ERROR: set OMNYID_GMAIL_CLIENT_SECRET in your environment before running.\n"
        "  e.g.  $env:OMNYID_GMAIL_CLIENT_SECRET = 'GOCSPX-...'",
        file=sys.stderr,
    )
    sys.exit(1)

# ── capture code from the redirect callback ───────────────────────────────────
_code: list[str] = []
_server_ready = threading.Event()


class _CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/auth/google/callback":
            params = urllib.parse.parse_qs(parsed.query)
            code = params.get("code", [None])[0]
            if code:
                _code.append(code)
                body = b"<html><body><h2>Authorization complete. You can close this tab.</h2></body></html>"
            else:
                error = params.get("error", ["unknown"])[0]
                body = f"<html><body><h2>Authorization failed: {error}</h2></body></html>".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, fmt, *args):
        pass  # suppress access log noise


def _run_server(server):
    _server_ready.set()
    while not _code:
        server.handle_request()


server = http.server.HTTPServer(("127.0.0.1", 3000), _CallbackHandler)
t = threading.Thread(target=_run_server, args=(server,), daemon=True)
t.start()
_server_ready.wait()

# ── open the browser ──────────────────────────────────────────────────────────
params = urllib.parse.urlencode({
    "client_id":     CLIENT_ID,
    "redirect_uri":  REDIRECT_URI,
    "response_type": "code",
    "scope":         SCOPES,
    "access_type":   "offline",
    "prompt":        "consent",  # force refresh_token even if previously granted
})
auth_url = f"{AUTH_URL}?{params}"
print(f"\nOpening browser for Gmail authorization...\n{auth_url}\n")
webbrowser.open(auth_url)

print("Waiting for redirect on http://localhost:3000 ...")
t.join(timeout=120)

if not _code:
    print("ERROR: timed out waiting for OAuth callback.", file=sys.stderr)
    sys.exit(1)

code = _code[0]

# ── exchange code for tokens ──────────────────────────────────────────────────
payload = urllib.parse.urlencode({
    "code":          code,
    "client_id":     CLIENT_ID,
    "client_secret": CLIENT_SECRET,
    "redirect_uri":  REDIRECT_URI,
    "grant_type":    "authorization_code",
}).encode()

req = urllib.request.Request(TOKEN_URL, data=payload, method="POST")
req.add_header("Content-Type", "application/x-www-form-urlencoded")

try:
    with urllib.request.urlopen(req) as resp:
        tokens = json.loads(resp.read())
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"ERROR: token exchange failed ({e.code}): {body}", file=sys.stderr)
    sys.exit(1)

refresh_token = tokens.get("refresh_token")
if not refresh_token:
    print(
        "ERROR: no refresh_token in response. "
        "Make sure 'prompt=consent' is set and the app is not already authorized "
        "without offline access.\n"
        f"Response: {tokens}",
        file=sys.stderr,
    )
    sys.exit(1)

print("\n" + "=" * 60)
print("SUCCESS — paste this into oracle-cloud.local.env:")
print(f"\n  OMNYID_GMAIL_REFRESH_TOKEN={refresh_token}\n")
print("=" * 60)
print("\nAlso set OMNYID_EMAIL_ADDRESS to the Gmail address you just authorized.")
