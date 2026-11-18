import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fixtures(page: Page, options: { empty?: boolean; conflict?: boolean; off?: boolean; review?: boolean } = {}) {
  let installed = !options.empty;
  let enabled = false;
  let status = options.review ? "completed" : "waiting_for_input";
  let revision = 4;
  let exportRequests = 0;
  const writes: {path:string;body:unknown}[] = [];
  const definition = () => ({runbook_id:"calendar_conflict",name:"Calendar conflict",version:1,message_id:"head1",enabled,status:"active",trigger_types:["calendar_conflict"]});
  const activity = () => ({instance:{instance_id:"i1",runbook_id:"calendar_conflict",revision,status},
    reviews: options.review ? [{id:"review1",trace_id:"emit1",title:"Review budget exposure",
      summary_lines:["Recorded commitments exceed the supplied budget.","No spending has been authorised.","<img src=x onerror=alert(1)>"],source_refs:["private_message:transform1"]}] : [],
    questions: status === "waiting_for_input" ? [{escalation_id:"q1",instance_id:"i1",step_id:"review",status:"open",
      question:"Which event has priority?",why_needed:"Your priority is needed to compare alternatives.",missing_fields:["priority"],
      attempted_refs:["message:calendar1"],answer_schema:"short_text",expires_at:"2099-01-01T00:00:00Z"}] : [],
    traces:[{trace_id:"t1",step_id:"read_context",kind:"read",status:"completed",started_at:"2026-11-18T00:00:00Z",
      source_refs:["message:calendar1"],output_refs:[],provenance_ref:null,approval_ref:null}]});
  await page.route("**/runbooks**", async route => {
    const url = new URL(route.request().url()); const path=url.pathname;
    if(options.off) return route.fulfill({status:404,body:"not_found"});
    if(route.request().method()==="POST") {
      const body=route.request().postDataJSON(); writes.push({path,body});
      if(options.conflict) return route.fulfill({status:409,body:"stale_revision PRIVATE_ERROR_BODY"});
      if(path.endsWith("/setup")) installed=true;
      if(path.endsWith("/enabled")) enabled=body.enabled;
      if(path.endsWith("/answers")) {status="running";revision++;}
      if(path.endsWith("/cancel")) {status="cancelled";revision++;}
      return route.fulfill({json:{definitions:[definition()]}});
    }
    if(path.endsWith("/export")) { exportRequests++; return route.fulfill({json:{message_id:"head1",definition:{runbook_id:"calendar_conflict",steps:[]}}}); }
    if(path.endsWith("/starters")) return route.fulfill({json:{starters:[definition()]}});
    if(path.endsWith("/instances")) return route.fulfill({json:{activities:installed?[activity()]:[],truncated:false}});
    return route.fulfill({json:{definitions:installed?[definition()]:[],execution_available:false}});
  });
  return { writes, exports:()=>exportRequests };
}

for (const width of [320,375,1280]) {
  test(`setup, confirmation, answer and evidence at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    const state=await fixtures(page,{empty:true});
    await page.goto("/workspace/e2e/runbook-controls.html");
    await page.getByRole("checkbox",{name:"Calendar conflict"}).check();
    await page.getByRole("button",{name:"Add selected runbooks disabled"}).click();
    await expect(page.getByText("Disabled · Version 1")).toBeVisible();
    expect(state.exports()).toBe(0);
    const enable=page.getByRole("button",{name:"Enable event matching",exact:true});
    await enable.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(enable).toBeFocused();
    await enable.click();
    await page.getByRole("dialog").getByRole("button",{name:"Enable event matching",exact:true}).click();
    await expect(page.getByText("Enabled for event matching · Version 1")).toBeVisible();
    await page.getByLabel("priority",{exact:true}).fill("Family appointment");
    await page.getByRole("button",{name:"Save answer to this step"}).click();
    await expect(page.getByText("Answer saved to this step.")).toBeVisible();
    const answer=state.writes.find(w=>w.path.endsWith("/answers"))!.body as any;
    expect(answer.expected_revision).toBe(4);expect(answer.input.answers).toEqual({priority:"Family appointment"});
    await page.getByText("Step history and evidence",{exact:true}).click();
    await expect(page.getByText("Sources: message:calendar1")).toBeVisible();
    await page.getByRole("button",{name:"Cancel this run…"}).click();
    await page.getByRole("dialog").getByRole("button",{name:"Cancel run and follow-ups"}).click();
    await expect(page.getByText("Cancelled",{exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
    const audit=await new AxeBuilder({page}).analyze();
    expect(audit.violations.filter(v=>v.impact==="serious"||v.impact==="critical")).toEqual([]);
  });
}
test("question queue, 200% zoom, keyboard, explicit export and stale errors", async ({page})=>{
  const state=await fixtures(page,{conflict:true});
  await page.setViewportSize({width:750,height:1200});
  await page.goto("/workspace/e2e/runbook-controls.html?questions");
  await page.evaluate(()=>{document.documentElement.style.zoom="2";});
  await expect(page.getByRole("heading",{name:"Runbook questions"})).toBeVisible();
  await expect(page.getByRole("button",{name:"Export definition…"})).toHaveCount(0);
  await page.getByLabel("priority",{exact:true}).focus();
  await page.keyboard.type("Work");await page.keyboard.press("Enter");
  await expect(page.getByText("Your answer was not saved.",{exact:false})).toBeVisible();
  await expect(page.getByText("PRIVATE_ERROR_BODY")).toHaveCount(0);
  await expect(page.getByRole("heading",{name:"Runbook questions"})).toBeFocused();
  expect(state.exports()).toBe(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
});
test("export requires confirmation and rollout-off hides controls",async({page})=>{
  const state=await fixtures(page);
  await page.goto("/workspace/e2e/runbook-controls.html");
  expect(state.exports()).toBe(0);
  await page.getByRole("button",{name:"Export definition…"}).click();
  expect(state.exports()).toBe(0);
  const download=page.waitForEvent("download");
  await page.getByRole("button",{name:"Download definition JSON",exact:true}).click();
  expect((await download).suggestedFilename()).toBe("runbook-calendar_conflict.json");
  expect(state.exports()).toBe(1);
  await page.unroute("**/runbooks**");await fixtures(page,{off:true});
  await page.reload();
  await expect(page.getByRole("heading",{name:"Runbooks",exact:true})).toHaveCount(0);
});

test("account switch aborts pending export and clears confirmation",async({page})=>{
  await fixtures(page);
  let release: (()=>Promise<void>) | undefined;
  let downloads=0;
  page.on("download",()=>downloads++);
  await page.route("**/runbooks/calendar_conflict/export",route=>new Promise<void>(resolve=>{
    release=async()=>{await route.fulfill({json:{definition:{name:"old account"}}}).catch(()=>{});resolve();};
  }));
  await page.goto("/workspace/e2e/runbook-controls.html");
  await page.getByRole("button",{name:"Export definition…"}).click();
  await page.getByRole("button",{name:"Download definition JSON",exact:true}).click();
  await expect.poll(()=>Boolean(release)).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event("omnyid:session-changed")));
  await release!();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Refresh runbooks"})).toHaveCount(0);
  expect(downloads).toBe(0);
});

test("expired session hides controls without an authentication retry loop",async({page})=>{
  let requests=0;
  await page.route("**/runbooks**",route=>{requests++;return route.fulfill({status:401,body:"unauthorized"});});
  await page.goto("/workspace/e2e/runbook-controls.html");
  await expect(page.getByRole("heading",{name:"Runbooks",exact:true})).toHaveCount(0);
  await page.waitForLoadState("networkidle");
  expect(requests).toBeGreaterThan(0);
  expect(requests).toBeLessThanOrEqual(2);
});


test("completed reviews remain visible in Decision Queue without execution controls",async({page})=>{
  const state=await fixtures(page,{review:true});
  await page.setViewportSize({width:320,height:900});
  await page.goto("/workspace/e2e/runbook-controls.html?questions");
  await expect(page.getByRole("heading",{name:"Review budget exposure",exact:true})).toBeVisible();
  await expect(page.getByText("No spending has been authorised.",{exact:true})).toBeVisible();
  await expect(page.getByText("<img src=x onerror=alert(1)>",{exact:true})).toBeVisible();
  expect(await page.locator("img[src=x]").count()).toBe(0);
  await page.getByText("Review sources",{exact:true}).click();
  await expect(page.getByText("private_message:transform1",{exact:true})).toBeVisible();
  expect(state.writes).toEqual([]);
  await expect(page.getByRole("button",{name:/approve|execute|send|pay/i})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  const audit=await new AxeBuilder({page}).analyze();
  expect(audit.violations.filter(v=>v.impact==="serious"||v.impact==="critical")).toEqual([]);
  await page.evaluate(()=>window.dispatchEvent(new Event("omnyid:session-changed")));
  await expect(page.getByRole("heading",{name:"Review budget exposure",exact:true})).toHaveCount(0);
});
