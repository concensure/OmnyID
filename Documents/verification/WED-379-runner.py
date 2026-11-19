import subprocess,pathlib,json,secrets,hashlib,datetime,time
root=pathlib.Path('/home/ubuntu/omnyid-candidates/wed379-24948b23')
assert (root/'build.exit').read_text().strip()=='0'
sha=(root/'source-sha').read_text().strip()
assert sha=='24948b23e4ec59b9af12ca08aa514a80d17d4c78'
network='omnyid-wed379-24948b23-internal'
db='omnyid-wed379-24948b23-postgres'
probe='omnyid-wed379-24948b23-probe'
def run(cmd,**kw): return subprocess.run(cmd,check=True,text=True,capture_output=True,**kw)
def inspect(name): return json.loads(run(['docker','inspect',name]).stdout)[0]
before=inspect('omnyid-homeserver-1')['Image']
run(['docker','network','create','--internal',network])
net=json.loads(run(['docker','network','inspect',network]).stdout)[0]
assert net['Internal'] is True
password=secrets.token_hex(24)
env=root/'probe-private.env'; env.write_text('POSTGRES_PASSWORD='+password+'\nPOSTGRES_USER=probe\nPOSTGRES_DB=wed379_runbook_probe\nRUNBOOK_PROBE_DATABASE_URL=postgres://probe:'+password+'@'+'omnyid-wed379-probe-postgres'+':5432/wed379_runbook_probe\nRUNBOOK_PROBE_SOURCE_SHA='+sha+'\nRUNBOOK_PROBE_ISOLATED=wed379-disposable\n');env.chmod(0o600)
cohort_owners='01ARZ3NDEKTSV4RRFFQ69G5FAV,01ARZ3NDEKTSV4RRFFQ69G5FAW'
expires=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(minutes=15)).isoformat()
with env.open('a') as private:
 private.write('OMNYID_ENCRYPTION_KEY_HEX='+secrets.token_hex(32)+'\nOMNYID_SIGNING_KEY_HEX='+secrets.token_hex(32)+'\n')
 private.write('OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED=true\nOMNYID_RUNBOOK_ALLOWLIST='+cohort_owners+'\n')
 private.write('OMNYID_RUNBOOK_DETERMINISTIC_ENABLED=true\nOMNYID_RUNBOOK_DETERMINISTIC_OWNERS='+cohort_owners+'\n')
 private.write('OMNYID_RUNBOOK_DETERMINISTIC_DEFINITIONS=budget_threshold@1,wed379_unsafe@1\nOMNYID_RUNBOOK_DETERMINISTIC_EXPIRES_AT='+expires+'\n')
 private.write('OMNYID_RUNBOOK_SHARED_INFERENCE_ENABLED=false\n')

run(['docker','run','-d','--name',db,'--network',network,'--network-alias','omnyid-wed379-probe-postgres','--memory','768m','--cpus','1','--tmpfs','/var/lib/postgresql:rw,size=512m','--env-file',str(env),'pgvector/pgvector:pg18'])
try:
 for i in range(30):
  r=subprocess.run(['docker','exec',db,'pg_isready','-h','127.0.0.1','-U','probe','-d','wed379_runbook_probe'],capture_output=True)
  if r.returncode==0: break
  time.sleep(1)
 else: raise RuntimeError('isolated database not ready')
 cmd=['docker','run','--name',probe,'--network',network,'--memory','768m','--cpus','1','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,size=32m','--env-file',str(env),'-v',str(root/'output')+':/probe:ro','omnyid-wed376-builder:rust1940','/probe/runbook-deterministic-probe']
 try:
  r=subprocess.run(cmd,text=True,capture_output=True,timeout=210)
 except subprocess.TimeoutExpired:
  subprocess.run(['docker','stop',probe],capture_output=True,text=True)
  r=subprocess.run(['docker','logs',probe],text=True,capture_output=True)
  r.returncode=124
 (root/'probe.stdout').write_text(r.stdout);(root/'probe.stderr').write_text(r.stderr);(root/'probe.exit').write_text(str(r.returncode))
 assert r.returncode==0, 'probe failed; see retained stderr'
 observed=json.loads(r.stdout)
 net=json.loads(run(['docker','network','inspect',network]).stdout)[0]
 members=sorted(v['Name'] for v in net['Containers'].values())
 # The probe has exited; Docker may remove its active network endpoint.
 assert set(members).issubset({db,probe}) and db in members
 after=inspect('omnyid-homeserver-1')['Image'];assert after==before
 for name in [db,probe]: assert not inspect(name)['HostConfig']['PortBindings']
 evidence={'source_sha':sha,'binary_sha256':hashlib.sha256((root/'output/runbook-deterministic-probe').read_bytes()).hexdigest(),'environment':'Oracle isolated application persisted-event cohort','cohort_expires_at':expires,'cohort_owners':cohort_owners.split(','),'collected_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'network':{'name':network,'internal':net['Internal'],'active_members':members,'host_port_bindings':False},'production_image_before':before,'production_image_after':after,'exit_code':r.returncode,'observations':observed,'hook_counters_log':r.stderr}
 (root/'hosted-evidence.json').write_text(json.dumps(evidence,indent=2))
 print(json.dumps(evidence,indent=2))
finally:
 # Only this newly created disposable database; never stop an application service.
 subprocess.run(['docker','stop',probe],capture_output=True,text=True)
 run(['docker','stop',db])
