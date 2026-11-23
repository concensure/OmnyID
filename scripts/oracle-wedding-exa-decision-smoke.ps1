param(
    [string]$RemoteHost = "",
    [string]$User = "",
    [string]$KeyPath = "",
    [string]$OutputPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$configFile = Join-Path $PSScriptRoot "oracle-config.local.ps1"
if (Test-Path -LiteralPath $configFile) { . $configFile }
if (-not $RemoteHost) { $RemoteHost = $ORACLE_HOST }
if (-not $User) { $User = $ORACLE_USER }
if (-not $KeyPath) { $KeyPath = $ORACLE_KEY }
if (-not $OutputPath) { $OutputPath = Join-Path $env:TEMP "omnyid-wedding-exa-decision-smoke.json" }

$remoteScript = @'
set -eu
container=omnyid-homeserver-1
key_file=$(docker exec "$container" sh -lc 'printf "%s" "${OMNYID_ADMIN_EXA_SEARCH_API_KEY_FILE:-${OMNYID_EXA_SEARCH_API_KEY_FILE:-${EXA_API_KEY_FILE:-}}}"')
if [ -z "$key_file" ]; then
  printf '%s\n' '{"status":"blocked","reason":"EXA key file is not configured"}'
  exit 2
fi
key=$(docker exec "$container" cat "$key_file" | tr -d '\r\n')
if [ -z "$key" ]; then
  printf '%s\n' '{"status":"blocked","reason":"EXA key is empty"}'
  exit 2
fi
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp" <<'PY'
import json, pathlib, sys
queries = [
  {"id":"transport","query":"official Sydney NSW wedding transport shuttle provider 40 guests wheelchair accessible capacity package inclusions"},
  {"id":"celebrant","query":"official Sydney NSW authorised marriage celebrant intimate micro wedding ceremony package inclusions"},
  {"id":"florist","query":"official Sydney NSW wedding florist intimate 40 guest seasonal native flowers package inclusions"},
]
pathlib.Path(sys.argv[1], "queries.json").write_text(json.dumps(queries), encoding="utf-8")
PY
count=$(python3 - "$tmp/queries.json" <<'PY'
import json, sys
print(len(json.load(open(sys.argv[1], encoding="utf-8"))))
PY
)
i=0
while [ "$i" -lt "$count" ]; do
  python3 - "$tmp/queries.json" "$i" "$tmp/payload.json" <<'PY'
import json, sys
query = json.load(open(sys.argv[1], encoding="utf-8"))[int(sys.argv[2])]["query"]
payload = {
  "query": query,
  "numResults": 5,
  "type": "auto",
  "excludeDomains": ["easyweddings.com.au","weddingwire.com","theknot.com","wedshed.com.au","venuecrew.com","tagvenue.com","hellomay.com.au","timeout.com","broadsheet.com.au"],
  "contents": {"highlights": {"numSentences": 2, "highlightsPerUrl": 1, "query": query}},
}
json.dump(payload, open(sys.argv[3], "w", encoding="utf-8"))
PY
  code=$(curl -sS -o "$tmp/result-$i.json" -w '%{http_code}' -X POST 'https://api.exa.ai/search' \
    -H 'Accept: application/json' -H 'Content-Type: application/json' -H "x-api-key: $key" \
    --data-binary "@$tmp/payload.json")
  printf '%s' "$code" >"$tmp/status-$i"
  i=$((i+1))
done
unset key
python3 - "$tmp" <<'PY'
import datetime, json, pathlib, sys
from urllib.parse import urlparse
root = pathlib.Path(sys.argv[1])
queries = json.loads((root / "queries.json").read_text(encoding="utf-8"))
directory_hosts = {"easyweddings.com.au","weddingwire.com","theknot.com","wedshed.com.au","venuecrew.com","tagvenue.com","hellomay.com.au","timeout.com","broadsheet.com.au"}
category_terms = {
  "transport": ("transport","shuttle","bus","coach","limousine","car"),
  "celebrant": ("celebrant","marriage","ceremony","officiant"),
  "florist": ("florist","floral","flower","bouquet"),
}
checks = []
for index, query in enumerate(queries):
    code = (root / f"status-{index}").read_text(encoding="utf-8")
    try: payload = json.loads((root / f"result-{index}.json").read_text(encoding="utf-8"))
    except Exception as exc:
        checks.append({"id":query["id"],"http_status":code,"sensible":False,"reason":f"invalid JSON: {exc}","results":[]})
        continue
    results = []
    for item in payload.get("results", [])[:5]:
        url = str(item.get("url") or "")
        title = str(item.get("title") or url)
        highlights = item.get("highlights") or []
        snippet = str(highlights[0] if highlights else item.get("text") or item.get("summary") or "")[:420]
        host = urlparse(url).hostname or ""
        host = host.lower().removeprefix("www.")
        relevant = any(term in f"{title} {snippet}".lower() for term in category_terms[query["id"]])
        official_like = bool(host) and host not in directory_hosts and not any(host.endswith("." + domain) for domain in directory_hosts)
        results.append({"title":title[:180],"url":url,"highlight":snippet,"relevant":relevant,"official_like":official_like})
    relevant_count = sum(1 for item in results if item["relevant"])
    official_count = sum(1 for item in results if item["official_like"])
    sensible = code == "200" and len(results) >= 3 and relevant_count >= 2 and official_count >= 2
    checks.append({"id":query["id"],"query":query["query"],"http_status":code,"result_count":len(results),"relevant_count":relevant_count,"official_like_count":official_count,"sensible":sensible,"results":results})
status = "pass" if all(check["sensible"] for check in checks) else "review"
print(json.dumps({"schema":"omnyid.wedding_exa_decision_smoke.v1","generated_at":datetime.datetime.now(datetime.timezone.utc).isoformat(),"status":status,"checks":checks}, separators=(",",":")))
PY
'@

$remoteScript = $remoteScript -replace "`r`n", "`n"
$encodedRemoteScript = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
$json = & $env:SystemRoot\System32\OpenSSH\ssh.exe -i $KeyPath -o StrictHostKeyChecking=accept-new "$User@$RemoteHost" "printf '%s' '$encodedRemoteScript' | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { throw "Oracle EXA smoke failed with exit code $LASTEXITCODE" }
$parsed = $json | ConvertFrom-Json
$directory = Split-Path -Parent $OutputPath
if ($directory) { New-Item -ItemType Directory -Force -Path $directory | Out-Null }
[System.IO.File]::WriteAllText($OutputPath, (($parsed | ConvertTo-Json -Depth 12) + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
$parsed | ConvertTo-Json -Depth 12
