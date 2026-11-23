#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "$0")" && pwd)"
bash -n "$script_dir/omnyid-wedding-monitor.sh"
bash -n "$script_dir/install-oracle-wedding-monitor.sh"
tmp_dir="$(mktemp -d)"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]]; then kill "$server_pid" >/dev/null 2>&1 || true; fi
  rm -rf -- "$tmp_dir"
}
trap cleanup EXIT
printf '%s\n' 'monitor@example.test' >"$tmp_dir/email"
printf '%s\n' 'correct horse battery staple' >"$tmp_dir/password"
OMNYID_MONITOR_MOCK_PORT_FILE="$tmp_dir/port" python3 "$script_dir/fixtures/wedding-monitor-mock.py" &
server_pid=$!
for _ in $(seq 1 50); do [[ -s "$tmp_dir/port" ]] && break; sleep 0.1; done
port="$(cat "$tmp_dir/port")"
OMNYID_WEDDING_MONITOR_BASE_URL="http://127.0.0.1:$port" \
OMNYID_WEDDING_MONITOR_EMAIL_FILE="$tmp_dir/email" \
OMNYID_WEDDING_MONITOR_PASSWORD_FILE="$tmp_dir/password" \
OMNYID_WEDDING_MONITOR_OUTPUT_FILE="$tmp_dir/result.json" \
  "$script_dir/omnyid-wedding-monitor.sh" >"$tmp_dir/stdout"
python3 - "$tmp_dir/result.json" "$tmp_dir/stdout" <<'PY'
import json, pathlib, sys
result = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
stdout = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
assert result["status"] == "pass", result
assert result["read_only"] is True
assert len(result["checks"]) == 8
assert "correct horse battery staple" not in stdout
assert all(check["http_status"] == "200" for check in result["checks"])
PY
grep -q 'OnCalendar=\*-\*-\* 08,20:00:00 Australia/Sydney' "$script_dir/systemd/omnyid-wedding-monitor.timer"
echo "wedding monitor self-test passed"
