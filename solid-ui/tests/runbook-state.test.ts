import test from "node:test";
import assert from "node:assert/strict";
import { runbookAnswer, runbookAnswerPayload, runbookViewIdentity, openRunbookQuestions, runbookTerminal, type RunbookActivity } from "../src/lib/runbookState.ts";
const q = { escalation_id:"q1",instance_id:"i1",step_id:"review",status:"open",question:"Priority?",
  why_needed:"Choose a priority",missing_fields:["priority"],attempted_refs:["message:one"],
  answer_schema:"short_text" as const,expires_at:"2099-01-01T00:00:00Z" };
const a: RunbookActivity={instance:{instance_id:"i1",runbook_id:"calendar_conflict",revision:4,status:"waiting_for_input"},questions:[q],traces:[]};
test("answers preserve typed false/zero and reject empty, non-finite, invalid date, oversized and controls",()=>{
  assert.equal(runbookAnswer("boolean","false"),false); assert.equal(runbookAnswer("non_negative_number","0"),0);
  assert.equal(runbookAnswer("date","2028-02-29"),"2028-02-29");
  for(const [schema,value] of [["date","2027-02-29"],["non_negative_number",""],["non_negative_number","Infinity"],["non_negative_number","-1"],["boolean","yes"],["short_text"," "],["short_text","x".repeat(513)],["short_text","bad\ninput"]] as const)
    assert.throws(()=>runbookAnswer(schema,value));
});
test("answer request binds exact instance question revision and required fields, never extra data",()=>{
  const payload=runbookAnswerPayload(a,q,{priority:"Work",secret:"omit"},"event1");
  assert.deepEqual(payload,{expected_revision:4,input:{event_id:"event1",instance_id:"i1",escalation_id:"q1",answers:{priority:"Work"}}});
  assert.throws(()=>runbookAnswerPayload({...a,instance:{...a.instance,status:"cancelled"}},q,{priority:"Work"},"event1"));
  assert.throws(()=>runbookAnswerPayload(a,{...q,instance_id:"foreign"},{priority:"Work"},"event1"));
  assert.deepEqual(openRunbookQuestions(a,Date.parse("2100-01-01")),[]);
});
test("semantic identities allow only reviewed kinds and safe ids; no embedded action is trusted",()=>{
  for(const kind of ["runbook_instance","runbook_step_summary","runbook_approval_link","runbook_question"])
    assert.deepEqual(runbookViewIdentity({kind,instance_id:"i1",owner:"foreign",approved:true}),{instanceId:"i1"});
  assert.deepEqual(runbookViewIdentity({kind:"runbook_definition",runbook_id:"calendar_conflict"}),{definitionId:"calendar_conflict"});
  assert.equal(runbookViewIdentity({kind:"runbook_question",instance_id:"../foreign"}),null);
  assert.equal(runbookViewIdentity({kind:"tool",instance_id:"i1"}),null);
  assert.equal(runbookTerminal("completed"),true);assert.equal(runbookTerminal("waiting_for_input"),false);
});


test("budget waits are visible, nonterminal and cannot accept epistemic answers", async()=>{
  const {runbookStatus}=await import("../src/lib/runbookState.ts");
  const waiting={...a,instance:{...a.instance,status:"waiting_for_budget"}};
  assert.equal(runbookStatus("waiting_for_budget"),"Paused: model budget unavailable");
  assert.equal(runbookTerminal("waiting_for_budget"),false);
  assert.deepEqual(openRunbookQuestions(waiting),[]);
  assert.throws(()=>runbookAnswerPayload(waiting,q,{priority:"Work"},"event1"));
});
