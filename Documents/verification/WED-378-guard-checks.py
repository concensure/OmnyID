import subprocess,pathlib,json
root=pathlib.Path('/home/ubuntu/omnyid-candidates/wed378-f6d1fdd6')
assert (root/'build.exit').read_text().strip()=='0'
base={'RUNBOOK_PROBE_SOURCE_SHA':(root/'source-sha').read_text().strip(),'RUNBOOK_PROBE_ISOLATED':'wed378-disposable','RUNBOOK_PROBE_DATABASE_URL':'postgres://probe:fixture@omnyid-wed378-probe-postgres:5432/wed378_runbook_probe'}
cases=[('application_database',{'RUNBOOK_PROBE_DATABASE_URL':'postgres://probe:fixture@omnyid-wed378-probe-postgres:5432/afp'},'wed378_runbook_probe'),('unexpected_host',{'RUNBOOK_PROBE_DATABASE_URL':'postgres://probe:fixture@production:5432/wed378_runbook_probe'},'omnyid-wed378-probe-postgres'),('enabled_rollout',{'OMNYID_RUNBOOK_EVENT_HOOKS_ENABLED':'true'},'rollout flags must remain off'),('provider_key',{'OPENAI_API_KEY':'synthetic-not-a-real-key'},'application/provider credentials must not enter the probe')]
results=[]
for name,overrides,expected in cases:
 env={**base,**overrides};cmd=['docker','run','--rm','--network','none','--read-only','--memory','256m','--cpus','1','--cap-drop','ALL','--security-opt','no-new-privileges','-v',str(root/'output')+':/probe:ro']
 for key,value in env.items():cmd.extend(['-e',key+'='+value])
 cmd.extend(['omnyid-wed376-builder:rust1940','/probe/runbook-rollout-probe'])
 r=subprocess.run(cmd,text=True,capture_output=True,timeout=20)
 assert r.returncode!=0 and expected in r.stderr,(name,r.returncode,r.stderr)
 results.append({'case':name,'exit_code':r.returncode,'expected_rejection_observed':True,'network':'none'})
evidence={'source_sha':base['RUNBOOK_PROBE_SOURCE_SHA'],'cases':results}
(root/'guard-evidence.json').write_text(json.dumps(evidence,indent=2));print(json.dumps(evidence))
