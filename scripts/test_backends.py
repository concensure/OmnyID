import os, openai, urllib.request, json

OR_BASE = "https://openrouter.ai/api/v1"
OR_HDR = {"HTTP-Referer":"https://omnyid.com","X-Title":"Nemotron"}
GLM_KEY = os.environ.get("GLM_API_KEY","")
GROK_KEY = os.environ.get("GROK_API_KEY","")
CEREBRAS_KEY = os.environ.get("CEREBRAS_API_KEY","")

def test(name, key, model):
    print(f"  {name}: ", end="", flush=True)
    try:
        r = openai.OpenAI(api_key=key, base_url=OR_BASE).chat.completions.create(
            model=model, max_tokens=20,
            messages=[{"role":"user","content":"Say hello"}],
            extra_headers=OR_HDR,
        )
        print("OK")
    except Exception as e:
        print(f"FAIL: {str(e)[:100]}")

print("=== GLM_API_KEY as OpenRouter ===")
test("llama-3.3-70b", GLM_KEY, "meta-llama/llama-3.3-70b-instruct")
test("grok-3-mini", GLM_KEY, "x-ai/grok-3-mini")
test("gemini-flash-2.0", GLM_KEY, "google/gemini-flash-2.0")

print("=== GROK_API_KEY as OpenRouter ===")
test("llama-3.3-70b", GROK_KEY, "meta-llama/llama-3.3-70b-instruct")
test("grok-3-mini", GROK_KEY, "x-ai/grok-3-mini")
test("gemini-flash-2.0", GROK_KEY, "google/gemini-flash-2.0")

print("=== Cerebras models ===")
req = urllib.request.Request(
    "https://api.cerebras.ai/v1/models",
    headers={"Authorization": "Bearer " + CEREBRAS_KEY, "Content-Type": "application/json"}
)
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read())
        for m in data.get("data", []):
            print(f"  {m.get('id','?')}")
except Exception as e:
    print(f"  FAIL: {e}")
