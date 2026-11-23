import AxeBuilder from "@axe-core/playwright";
import {expect,test,type Page} from "@playwright/test";
async function setup(page:Page,options:{expired?:boolean;off?:boolean;conflict?:boolean}={}) {
  const writes:unknown[]=[]; let status="pending"; let instanceStatus="awaiting_approval";
  const r={proposal_ref:"p1",step_id:"tool",tool_slug:"mail",capability:"read",request_hash:"a".repeat(64),expires_at:options.expired?"2000-01-01T00:00:00Z":"2099-01-01T00:00:00Z"};
  await page.route("**/runbooks**",async route=>{
    const path=new URL(route.request().url()).pathname;
    if(route.request().method()==="POST") {
      writes.push({path,body:route.request().postDataJSON()});
      if(options.conflict) return route.fulfill({status:403,body:"PRIVATE_ERROR_BODY"});
      status=route.request().postDataJSON().approved?"approved":"rejected"; instanceStatus=status==="approved"?"running":"cancelled";
      return route.fulfill({json:{execution_available:false}});
    }
    if(path.endsWith("/tools/p1")) return route.fulfill({json:{proposal:{...r,instance_id:"i1",expected_revision:2,request:{tool_slug:"mail",capability:"read",arguments:{limit:0,confirmed:false,text:"<img src=x onerror=alert(1)>"}}}}});
    return route.fulfill({json:{activities:[{instance:{instance_id:"i1",runbook_id:"tool_review",status:instanceStatus,revision:3,current_step_id:"tool"},tool_review_available:!options.off,
      tool_reviews:[{...r,status:options.expired&&status==="pending"?"expired":status}],questions:[],traces:[]}],truncated:false}});
  });
  await page.goto("/workspace/e2e/runbook-controls.html?questions");
  return writes;
}
test("exact tool review confirms dedicated target, escapes arguments and fits a phone",async({page})=>{
  await page.setViewportSize({width:320,height:900});
  const writes=await setup(page);
  await expect(page.getByRole("button",{name:"Approve tool action…",exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"Review exact tool action"}).click();
  await expect(page.getByLabel("Exact tool arguments")).toContainText('"limit": 0');
  await expect(page.getByLabel("Exact tool arguments")).toContainText('"confirmed": false');
  await expect(page.locator("img[src=x]")).toHaveCount(0);
  await page.getByRole("button",{name:"Approve tool action…",exact:true}).click();
  expect(writes).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button",{name:"Approve tool action…",exact:true})).toBeFocused();
  const audit=await new AxeBuilder({page}).analyze();
  expect(audit.violations.filter(v=>v.impact==="serious"||v.impact==="critical")).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth)).toBe(true);
  await page.getByRole("button",{name:"Approve tool action…",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Approve tool action",exact:true}).click();
  await expect(page.getByText("Decision: approved",{exact:true})).toBeVisible();
  expect(writes).toEqual([{path:"/runbooks/instances/i1/tools/p1/decision",body:{expected_revision:3,approved:true}}]);
});
test("expired actions allow rejection and a disabled review flag hides controls",async({page})=>{
  const writes=await setup(page,{expired:true});
  await page.getByRole("button",{name:"Review exact tool action"}).click();
  await expect(page.getByRole("button",{name:"Approve tool action…",exact:true})).toBeDisabled();
  await page.getByRole("button",{name:"Reject tool action…",exact:true}).click();
  await page.getByRole("dialog").getByRole("button",{name:"Reject tool action",exact:true}).click();
  expect(writes).toEqual([{path:"/runbooks/instances/i1/tools/p1/decision",body:{expected_revision:3,approved:false}}]);
  await page.unroute("**/runbooks**"); await setup(page,{off:true});
  await expect(page.getByText("Tool review is currently unavailable.")).toBeVisible();
  await expect(page.getByRole("button",{name:"Review exact tool action"})).toHaveCount(0);
});
test("unconfirmed decision requires refresh and account switch clears private arguments",async({page})=>{
  const writes=await setup(page,{conflict:true});
  await page.getByRole("button",{name:"Review exact tool action"}).click();
  await page.getByRole("button",{name:"Approve tool action…",exact:true}).click();
  await page.getByRole("button",{name:"Approve tool action",exact:true}).click();
  await expect(page.getByText("The change was not confirmed. Refresh before trying again.")).toBeVisible();
  await expect(page.getByText("PRIVATE_ERROR_BODY")).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Reject tool action…",exact:true})).toBeDisabled();
  expect(writes).toHaveLength(1);
  await page.evaluate(()=>window.dispatchEvent(new Event("omnyid:session-changed")));
  await expect(page.getByLabel("Exact tool arguments")).toHaveCount(0);
});
