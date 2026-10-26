(() => {
  "use strict";
  const config = window.GATE_PROTOCOL_CONFIG;
  if (!config) return;
  const $ = (id) => document.getElementById(id);
  const key = `omnyid-human-gate-protocol:${config.id}:v2`;
  let state = { sourceCommit: config.sourceCommit || "", runtimeCommit: "", hostedUrl: "", owner: "", gates: {}, signoff: {} };
  try { state = Object.assign(state, JSON.parse(localStorage.getItem(key) || "{}")); } catch (_) {}
  state.gates ||= {}; state.signoff ||= {};
  const save = () => localStorage.setItem(key, JSON.stringify(state));
  const element = (tag, text, className) => { const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node; };
  const field = (label, input) => { const wrapper = element("div"); const lab = element("label", label); if (input.id) lab.htmlFor = input.id; wrapper.append(lab, input); return wrapper; };
  const textInput = (id, value = "") => { const input = element("input"); input.id = id; input.type = "text"; input.value = value; return input; };
  const shaOk = (value) => /^[0-9a-f]{40}$/i.test(value || "");
  const digestOk = (value) => /^[0-9a-f]{64}$/i.test(value || "");
  const dateOk = (value) => !Number.isNaN(Date.parse(value || ""));

  function renderCompleted() {
    const target = $("completed");
    config.completed.forEach((item) => {
      const card = element("article", "", "item"); card.dataset.status = item.status;
      card.append(element("span", item.status, "badge"), element("h3", item.title), element("p", item.evidence));
      if (item.command) card.append(element("pre", item.command));
      target.append(card);
    });
  }

  function gateState(id) {
    return state.gates[id] ||= { status: "not_started", person: "", recordedAt: "", reference: "", digest: "", notes: "", actions: {} };
  }

  function gateValid(gate) {
    const data = gateState(gate.id);
    return data.status === "passed" && data.person.trim() && dateOk(data.recordedAt) && data.reference.trim() && digestOk(data.digest) && gate.actions.every((_, index) => data.actions[index]);
  }

  function renderGates() {
    const target = $("gates");
    config.gates.slice(0, 3).forEach((gate, gateIndex) => {
      const data = gateState(gate.id);
      const card = element("article", "", "card gate"); card.id = `gate-${gate.id}`; card.dataset.state = data.status;
      card.append(element("span", `Gate ${gateIndex + 1} · ${gate.type}`, "badge"), element("h3", `${gate.id}: ${gate.title}`));
      const dl = element("dl");
      [["Why a human is necessary", gate.why], ["Current state", gate.current], ["Target", gate.target], ["Expected result", gate.expected], ["Pass / fail", gate.criteria], ["Failure recovery", gate.recovery], ["Resume condition", gate.resume], ["Blocking scope", gate.blocking]].forEach(([name, value]) => { dl.append(element("dt", name), element("dd", value)); });
      card.append(dl, element("h3", "Actions"));
      gate.actions.forEach((action, index) => {
        const label = element("label", "", "check"); const input = element("input"); input.type = "checkbox"; input.checked = !!data.actions[index];
        input.addEventListener("change", () => { data.actions[index] = input.checked; save(); refresh(); });
        label.append(input, element("span", `${index + 1}. ${action}`)); card.append(label);
      });
      const grid = element("div", "", "grid");
      const select = element("select"); select.id = `${gate.id}-status`;
      [["not_started", "Not started"], ["blocked", "Blocked"], ["failed", "Failed"], ["passed", "Passed by named authority"]].forEach(([value, label]) => { const option = element("option", label); option.value = value; select.append(option); }); select.value = data.status;
      const person = textInput(`${gate.id}-person`, data.person); const recorded = textInput(`${gate.id}-recorded`, data.recordedAt); recorded.placeholder = "2026-10-26T12:00:00+11:00";
      const reference = textInput(`${gate.id}-reference`, data.reference); reference.placeholder = "Stable report path or controlled URL";
      const digest = textInput(`${gate.id}-digest`, data.digest); digest.maxLength = 64; digest.spellcheck = false;
      const upload = element("input"); upload.type = "file"; upload.accept = ".md,.txt,.json,.html,.pdf,.zip";
      const notes = element("textarea"); notes.id = `${gate.id}-notes`; notes.value = data.notes; notes.placeholder = "Findings and content-free evidence notes";
      grid.append(field("Gate status", select), field("Named person / authority", person), field("Recorded at (RFC 3339)", recorded), field("Evidence reference", reference), field("Evidence SHA-256", digest), field("Calculate digest from report", upload), field("Findings or blockers", notes)); grid.lastElementChild.classList.add("full");
      card.append(grid); const message = element("p", "", "muted"); message.id = `${gate.id}-message`; card.append(message); target.append(card);
      [[select, "status"], [person, "person"], [recorded, "recordedAt"], [reference, "reference"], [digest, "digest"], [notes, "notes"]].forEach(([input, name]) => input.addEventListener("input", () => { data[name] = input.value; card.dataset.state = data.status; save(); refresh(); }));
      upload.addEventListener("change", async () => { const file = upload.files[0]; if (!file) return; try { const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); data.digest = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); data.reference ||= file.name; data.recordedAt ||= new Date().toISOString(); digest.value = data.digest; reference.value = data.reference; recorded.value = data.recordedAt; save(); refresh(); } catch (_) { message.textContent = "Open through localhost or enter the digest from Get-FileHash."; } });
    });
  }

  function renderList(targetId, items) { const list = $(targetId); items.forEach((item) => list.append(element("li", item))); }

  function bindIdentity() {
    [["sourceCommit", "sourceCommit"], ["runtimeCommit", "runtimeCommit"], ["hostedUrl", "hostedUrl"], ["packetOwner", "owner"]].forEach(([id, name]) => { const input = $(id); input.value = state[name] || ""; input.addEventListener("input", () => { state[name] = input.value.trim(); save(); refresh(); }); });
    [["decision", "decision"], ["signedBy", "signedBy"], ["signedAt", "signedAt"], ["signoffNotes", "notes"]].forEach(([id, name]) => { const input = $(id); input.value = state.signoff[name] || ""; input.addEventListener("input", () => { state.signoff[name] = input.value; save(); refresh(); }); });
  }

  function refresh() {
    const frozen = shaOk(state.sourceCommit); const runtimeMatch = frozen && state.runtimeCommit.toLowerCase() === state.sourceCommit.toLowerCase();
    $("freezeStatus").textContent = !frozen ? "Enter the exact 40-character commit before review." : !shaOk(state.runtimeCommit) ? "Source is recorded; hosted runtime evidence is still missing." : !runtimeMatch ? "STOP: hosted runtime does not match the frozen source." : "Frozen source and hosted runtime match.";
    $("freezeStatus").className = `status ${runtimeMatch ? "ok" : "bad"}`;
    config.gates.slice(0, 3).forEach((gate) => { const data = gateState(gate.id); const message = $(`${gate.id}-message`); message.textContent = data.status === "passed" ? (gateValid(gate) ? "Objective evidence fields are complete." : "Marked passed, but an action, named authority, timestamp, reference or digest is missing.") : "This gate is not passed."; });
    const passed = config.gates.slice(0, 3).filter(gateValid).length;
    const autonomousReady = config.remaining.length === 0 && config.completed.every((item) => item.status === "complete");
    $("gateProgress").textContent = `${passed}/${Math.min(3, config.gates.length)} human gates passed · autonomous evidence ${autonomousReady ? "complete" : "still open"}`;
    const final = autonomousReady && runtimeMatch && passed === Math.min(3, config.gates.length) && state.signoff.decision === "approve" && state.signoff.signedBy?.trim() && dateOk(state.signoff.signedAt);
    $("finalStatus").textContent = final ? "SIGNED OFF" : "BLOCKED"; $("finalStatus").className = `status ${final ? "ok" : "bad"}`; $("exportFinal").disabled = !final;
    save();
  }

  function download(name, value) { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" })); const anchor = element("a"); anchor.href = url; anchor.download = name; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 4_000); }
  function packet() { return { schema_version: "omnyid.human_gate_execution.v2", workbook: config.id, title: config.title, source_commit: state.sourceCommit, runtime_commit: state.runtimeCommit, hosted_url: state.hostedUrl, packet_owner: state.owner, automatically_completed: config.completed, human_gates: state.gates, optional_acceptance: config.optional, remaining_autonomous_work: config.remaining, signoff: state.signoff, exported_at: new Date().toISOString() }; }

  $("exportDraft").addEventListener("click", () => download(`${config.id}-draft.json`, packet()));
  $("exportFinal").addEventListener("click", () => download(`${config.id}-signed-${state.sourceCommit.slice(0, 12)}.json`, packet()));
  const dialog = $("clearDialog"), clearOpen = $("clearOpen"), clearCancel = $("clearCancel"), clearConfirm = $("clearConfirm"); let restoreFocus;
  clearOpen.addEventListener("click", () => { restoreFocus = document.activeElement; dialog.hidden = false; clearCancel.focus(); });
  clearCancel.addEventListener("click", () => { dialog.hidden = true; restoreFocus?.focus(); });
  clearConfirm.addEventListener("click", () => { localStorage.removeItem(key); location.reload(); });
  dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") clearCancel.click(); });

  document.title = config.title; $("title").textContent = config.title; $("lede").textContent = config.lede;
  renderCompleted(); renderGates(); renderList("optional", config.optional); renderList("remaining", config.remaining); bindIdentity(); refresh();
})();
