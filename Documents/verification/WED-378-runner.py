import subprocess,pathlib,json,secrets,hashlib,datetime,time
root=pathlib.Path('/home/ubuntu/omnyid-candidates/wed378-f6d1fdd6')
assert (root/'build.exit').read_text().strip()=='0'
sha=(root/'source-sha').read_text().strip()
assert sha=='f6d1fdd642f0ef6b8e025accc24cb5da324a8247'
network='omnyid-wed378-probe-internal'
db='omnyid-wed378-probe-postgres'
probe='omnyid-wed378-probe'
def run(cmd,**kw): return subprocess.run(cmd,check=True,text=True,capture_output=True,**kw)
def inspect(name): return json.loads(run(['docker','inspect',name]).stdout)[0]
before=inspect('omnyid-homeserver-1')['Image']
run(['docker','network','create','--internal',network])
net=json.loads(run(['docker','network','inspect',network]).stdout)[0]
assert net['Internal'] is True
password=secrets.token_hex(24)
env=root/'probe-private.env'; env.write_text('POSTGRES_PASSWORD='+password+'\nPOSTGRES_USER=probe\nPOSTGRES_DB=wed378_runbook_probe\nRUNBOOK_PROBE_DATABASE_URL=postgres://probe:'+password+'@'+db+':5432/wed378_runbook_probe\nRUNBOOK_PROBE_SOURCE_SHA='+sha+'\nRUNBOOK_PROBE_ISOLATED=wed378-disposable\n');env.chmod(0o600)
run(['docker','run','-d','--name',db,'--network',network,'--memory','768m','--cpus','1','--tmpfs','/var/lib/postgresql:rw,size=512m','--env-file',str(env),'pgvector/pgvector:pg18'])
try:
 for i in range(30):
  r=subprocess.run(['docker','exec',db,'pg_isready','-h','127.0.0.1','-U','probe','-d','wed378_runbook_probe'],capture_output=True)
  if r.returncode==0: break
  time.sleep(1)
 else: raise RuntimeError('isolated database not ready')
 cmd=['docker','run','--name',probe,'--network',network,'--memory','768m','--cpus','1','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--tmpfs','/tmp:rw,size=32m','--env-file',str(env),'-v',str(root/'output')+':/probe:ro','omnyid-wed376-builder:rust1940','/probe/runbook-rollout-probe']
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
 evidence={'source_sha':sha,'binary_sha256':hashlib.sha256((root/'output/runbook-rollout-probe').read_bytes()).hexdigest(),'environment':'Oracle isolated operator fixture database','collected_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'network':{'name':network,'internal':net['Internal'],'active_members':members,'host_port_bindings':False},'production_image_before':before,'production_image_after':after,'exit_code':r.returncode,'observations':observed}
 (root/'hosted-evidence.json').write_text(json.dumps(evidence,indent=2))
 print(json.dumps(evidence,indent=2))
finally:
 # Only this newly created disposable database; never stop an application service.
 subprocess.run(['docker','stop',probe],capture_output=True,text=True)
 run(['docker','stop',db])
