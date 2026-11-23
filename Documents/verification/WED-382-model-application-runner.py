"""Run only once in an exact-source Oracle candidate. No production mutations."""
import datetime, hashlib, json, pathlib, secrets, subprocess, time
root=pathlib.Path(__file__).resolve().parent
sha=(root/'source-sha').read_text().strip()
assert len(sha)==40 and all(c in '0123456789abcdef' for c in sha)
prefix='omnyid-wed380-'+sha[:8]
network=prefix+'-model'; db=prefix+'-model-postgres'; probe=prefix+'-model-probe'
def run(args):return subprocess.run(args,text=True,capture_output=True,check=True)
def inspect(name):return json.loads(run(['docker','inspect',name]).stdout)[0]
production=inspect('omnyid-homeserver-1'); before=production['Image']
config=dict(v.split('=',1) for v in production['Config']['Env'] if '=' in v)
secret_path=config['OMNYID_OPENAI_API_KEY_FILE']
secret_destination=pathlib.PurePosixPath(secret_path)
mounts=[m for m in production['Mounts'] if secret_destination.is_relative_to(m['Destination'])]
assert mounts, 'configured secret file has no mounted source'
mount=max(mounts,key=lambda m:len(m['Destination']))
secret_source=pathlib.Path(mount['Source'])/secret_destination.relative_to(mount['Destination'])
assert secret_source.is_file()
for name in [db,probe]:assert subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0
run(['docker','network','create',network])
password=secrets.token_hex(32)
env=root/'model-private.env'
with env.open('x') as f:
 env.chmod(0o600)
 f.write('RUNBOOK_APPLICATION_ONLY=true\nPOSTGRES_USER=probe\nPOSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=wed380_model_probe\n')
 f.write('RUNBOOK_PROBE_DATABASE_URL=postgres://probe:'+password+'@omnyid-wed380-model-postgres:5432/wed380_model_probe\n')
 f.write('RUNBOOK_PROBE_SOURCE_SHA='+sha+'\nRUNBOOK_PROBE_ISOLATED=wed380-model-disposable\n')
 f.write('OMNYID_OPENAI_API_KEY_FILE=/run/secrets/eval_openai\nOMNYID_OPENROUTER_FUNDED_ENABLED=true\nOMNYID_OPENROUTER_WEEKLY_CAP_USD=3\n')
 f.write('OMNYID_RUNBOOK_SHARED_INFERENCE_ENABLED=true\nOMNYID_RUNBOOK_ALLOWLIST=01ARZ3NDEKTSV4RRFFQ69G5FAY\n')
run(['docker','run','-d','--name',db,'--network',network,'--network-alias','omnyid-wed380-model-postgres','--memory','768m','--cpus','1','--tmpfs','/var/lib/postgresql:rw,size=512m','--env-file',str(env),'pgvector/pgvector:pg18'])
try:
 for _ in range(30):
  if subprocess.run(['docker','exec',db,'pg_isready','-h','127.0.0.1','-U','probe','-d','wed380_model_probe'],capture_output=True).returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('database not ready')
 cmd=['docker','run','--name',probe,'--network',network,'--memory','768m','--cpus','1','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,size=32m','--env-file',str(env),'-v',str(root/'output')+':/probe:ro','-v',str(secret_source)+':/run/secrets/eval_openai:ro','omnyid-wed376-builder:rust1940','/probe/runbook-model-eval']
 try:r=subprocess.run(cmd,text=True,capture_output=True,timeout=1050)
 except subprocess.TimeoutExpired:
  subprocess.run(['docker','stop',probe],capture_output=True)
  r=subprocess.run(['docker','logs',probe],text=True,capture_output=True);r.returncode=124
 (root/'model.stdout').write_text(r.stdout);(root/'model.stderr').write_text(r.stderr)
 records=[json.loads(line) for line in r.stdout.splitlines() if line.startswith('{')]
 after=inspect('omnyid-homeserver-1')['Image'];assert before==after
 for name in [db,probe]:assert not inspect(name)['HostConfig']['PortBindings']
 evidence={'source_sha':sha,'binary_sha256':hashlib.sha256((root/'output/runbook-model-eval').read_bytes()).hexdigest(),'collected_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit_code':r.returncode,'records':records,'production_image_before':before,'production_image_after':after,'synthetic_only':True,'maximum_evaluation_exposure_usd':0.075,'host_ports':False,'production_flags_changed':False}
 (root/'model-evidence.json').write_text(json.dumps(evidence,indent=2))
 print(json.dumps({'exit_code':r.returncode,'records':len(records),'final_event':records[-1]['event'] if records else None}))
 assert r.returncode==0 and records and records[-1]['event']=='complete','evaluation incomplete; inspect retained evidence'
finally:
 subprocess.run(['docker','stop',probe],capture_output=True)
 subprocess.run(['docker','stop',db],capture_output=True)
