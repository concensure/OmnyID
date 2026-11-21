#!/usr/bin/env python3
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        return

    def reply(self, status, body, content_type="application/json", headers=None):
        encoded = body.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        for key, value in headers or []:
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(encoded)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        if self.path == "/api/auth/login" and payload == {"email": "monitor@example.test", "password": "correct horse battery staple"}:
            self.reply(200, json.dumps({"token": "monitor-token", "user": {"id": "monitor", "email": "monitor@example.test"}}), headers=[("Set-Cookie", "omnyid_session=monitor-token; Path=/; HttpOnly")])
        else:
            self.reply(401, json.dumps({"error": "unauthorised"}))

    def do_DELETE(self):
        self.reply(200, json.dumps({"ok": True}))

    def do_GET(self):
        if self.path == "/wedding/":
            return self.reply(200, "<html><title>OmnyID Wedding</title></html>", "text/html")
        if self.path == "/workspace/":
            return self.reply(200, '<html><script type="module" src="/workspace/assets/main-test.js"></script></html>', "text/html")
        if self.path == "/workspace/assets/main-test.js":
            return self.reply(200, "console.log('ok')", "text/javascript", [("Cache-Control", "public,max-age=31536000,immutable")])
        if self.headers.get("Authorization") != "Bearer monitor-token":
            return self.reply(401, json.dumps({"error": "unauthorised"}))
        if self.path == "/api/auth/session":
            return self.reply(200, json.dumps({"id": "monitor", "email": "monitor@example.test"}))
        if self.path == "/api/dashboard/bootstrap":
            return self.reply(200, json.dumps({"messages": [], "threads": [], "monitor_workspace": True}))
        if self.path == "/healthz":
            return self.reply(200, json.dumps({"status": "ok", "service": "omnyid-homeserver"}))
        if self.path == "/readyz":
            return self.reply(200, json.dumps({"status": "ready", "dependencies": {"database": "ok", "daemons": "ok", "object_store": "ok"}}))
        self.reply(404, json.dumps({"error": "not found"}))


server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
path = os.environ["OMNYID_MONITOR_MOCK_PORT_FILE"]
with open(path, "w", encoding="utf-8") as handle:
    handle.write(str(server.server_port))
server.serve_forever()
