"""Single-use, internal-network real-adapter sandbox. No application credentials."""
import datetime,hashlib,json,os,pathlib,secrets,subprocess,time
root=pathlib.Path(__file__).resolve().parent;sha=(root/'source-sha').read_text().strip()
assert len(sha)==40 and all(c in '0123456789abcdef' for c in sha)
runner_digest=hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
prefix='omnyid-wed380-'+sha[:8]+'-sandbox-'+runner_digest[:8];db=prefix+'-db';server=prefix+'-server';probe=prefix+'-probe'
def run(args):return subprocess.run(args,text=True,capture_output=True,check=True)
def inspect(name):return json.loads(run(['docker','inspect',name]).stdout)[0]
before=inspect('omnyid-homeserver-1')['Image']
for name in [db,server,probe]:assert subprocess.run(['docker','inspect',name],capture_output=True).returncode!=0
run(['docker','network','create','--internal',prefix])
results=root/'sandbox-results';results.mkdir()
env=root/'sandbox-private.env';password=secrets.token_hex(32)
with env.open('x') as f:
 env.chmod(0o600)
 f.write('POSTGRES_USER=probe\nPOSTGRES_PASSWORD='+password+'\nPOSTGRES_DB=wed380_sandbox_probe\n')
 f.write('RUNBOOK_PROBE_DATABASE_URL=postgres://probe:'+password+'@omnyid-wed380-sandbox-postgres:5432/wed380_sandbox_probe\n')
 f.write('RUNBOOK_PROBE_SOURCE_SHA='+sha+'\nRUNBOOK_PROBE_ISOLATED=wed380-sandbox-disposable\n')
 f.write('SANDBOX_ROOT_KEY='+secrets.token_hex(32)+'\nSANDBOX_BEARER='+secrets.token_hex(32)+'\n')
try:
 run(['docker','run','-d','--name',db,'--network',prefix,'--network-alias','omnyid-wed380-sandbox-postgres','--memory','768m','--cpus','1','--tmpfs','/var/lib/postgresql:rw,size=512m','--env-file',str(env),'pgvector/pgvector:pg18'])
 for _ in range(30):
  if subprocess.run(['docker','exec',db,'pg_isready','-h','127.0.0.1','-U','probe','-d','wed380_sandbox_probe'],capture_output=True).returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('database not ready')
 run(['docker','run','-d','--name',server,'--user',f'{os.getuid()}:{os.getgid()}','--network',prefix,'--memory','128m','--cpus','0.5','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--env-file',str(env),'-v',str(root/'sandbox-server.py')+':/server.py:ro','-v',str(results)+':/sandbox-results','python:3.12-alpine','python','-B','/server.py'])
 for _ in range(30):
  ready=subprocess.run(['docker','exec',server,'python','-c',"import socket;s=socket.create_connection(('127.0.0.1',18380),1);s.close()"],capture_output=True)
  if ready.returncode==0:break
  time.sleep(1)
 else:raise RuntimeError('sandbox not ready')
 cmd=['docker','run','--name',probe,'--network','container:'+server,'--memory','768m','--cpus','1','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,size=32m','--env-file',str(env),'-v',str(root/'output')+':/probe:ro','-v',str(results)+':/sandbox-results:ro','omnyid-wed376-builder:rust1940','/probe/runbook-sandbox-probe']
 try:r=subprocess.run(cmd,text=True,capture_output=True,timeout=750)
 except subprocess.TimeoutExpired:
  subprocess.run(['docker','stop',probe],capture_output=True);r=subprocess.run(['docker','logs',probe],text=True,capture_output=True);r.returncode=124
 (root/'sandbox.stdout').write_text(r.stdout);(root/'sandbox.stderr').write_text(r.stderr)
 records=[json.loads(s) for s in r.stdout.splitlines() if s.startswith('{')]
 effects=[json.loads(s) for s in (results/'effects.jsonl').read_text().splitlines()] if (results/'effects.jsonl').exists() else []
 after=inspect('omnyid-homeserver-1')['Image'];assert before==after
 net=json.loads(run(['docker','network','inspect',prefix]).stdout)[0];assert net['Internal']
 for name in [db,server,probe]:assert not inspect(name)['HostConfig']['PortBindings']
 evidence={'source_sha':sha,'runner_sha256':runner_digest,'binary_sha256':hashlib.sha256((root/'output/runbook-sandbox-probe').read_bytes()).hexdigest(),'independent_validation_passed':False,'exit_code':r.returncode,'records':records,'independent_effects':effects,'internal_network':True,'server_image':inspect(server)['Image'],'production_image_before':before,'production_image_after':after,'collected_at':datetime.datetime.now(datetime.timezone.utc).isoformat()}
 (root/'sandbox-evidence.json').write_text(json.dumps(evidence,indent=2))
 assert r.returncode==0 and records[-1].get('event')=='complete','probe failed; inspect retained evidence'
 expected={'success','cancel','drop','delay','persistfail','application_http'}
 assert len(effects)==6 and {e['marker'] for e in effects}==expected
 for record in records:
  if record.get('case') in expected:
   assert sum(e['marker']==record['case'] for e in effects)==1
   if record['case']=='application_http':
    assert all(record.get(k) is True for k in ['approved','replay_suppressed','cross_owner_denied','stale_auth_denied','missing_approval_denied','request_policy_override_denied'])
    continue
   output=record['receipt']['output']
   if output is not None:assert output=={'marker':record['case'],'created':True}
 evidence['independent_validation_passed']=True
 (root/'sandbox-evidence.json').write_text(json.dumps(evidence,indent=2))
 print(json.dumps({'cases':12,'independently_verified_effects':6,'source_sha':sha}))
finally:
 for name in [probe,server,db]:subprocess.run(['docker','stop',name],capture_output=True)
