import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8");

test("public Wedding proof is qualified and does not pose examples as customers", () => {
  const home = read("wedding/index.html");
  assert.match(home, /Illustrative scenario, not a customer story/);
  assert.match(home, /Renee and Kai are fictional/);
  assert.match(home, /fictional interface example, not a customer account/);
  assert.doesNotMatch(home, /Why couples choose OmnyID/);
  assert.doesNotMatch(home, /Real days, made calmer/);
  assert.match(home, /nothing is sent until the couple approves it/i);
  assert.doesNotMatch(home, /planning hours organi[sz]ed per month/i);
  assert.doesNotMatch(home, /hidden costs surfaced before booking/i);
  assert.doesNotMatch(home, /97% target deadline coverage/i);
});

test("coverage and pricing avoid unsupported breadth and popularity claims", () => {
  const home = read("wedding/index.html");
  const directory = read("wedding/vendors.html");
  const pricing = read("wedding/pricing.html");
  assert.match(home, /Vendor coverage is NSW-first and expanding/);
  assert.match(directory, /Sydney and regional NSW businesses currently in the directory/);
  assert.match(directory, /not that a vendor suits your wedding or is available/);
  assert.doesNotMatch(pricing, /Most couples choose this/);
  assert.doesNotMatch(pricing, /monthly limit/);
});

test("the public preview exposes existing guest seating and scoped-sharing capabilities", () => {
  const home = read("wedding/index.html");
  assert.match(home, /data-tab="guests"/);
  assert.match(home, /data-pane="guests"/);
  assert.match(home, /Guest replies and seating stay connected/);
  assert.match(home, /Invite the right people, with limits/);
  assert.match(home, /NOIM reminders, not legal lodgement/);
});
