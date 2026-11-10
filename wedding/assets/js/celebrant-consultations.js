(() => {
  const cards = document.getElementById("celebrantCards");
  const status = document.getElementById("celebrantStatus");
  const form = document.getElementById("celebrantIntake");
  const receipt = document.getElementById("requestReceipt");
  if (!cards || !status || !form || !receipt) return;
  let availability = [];
  let verificationId = "";
  let verificationToken = "";
  let activeRequest = null;
  let pollTimer = 0;
  const api = async (url, options = {}) => {
    const response = await fetch(url, { credentials: "same-origin", headers: { "content-type": "application/json", ...(options.headers || {}) }, ...options });
    const text = await response.text();
    let body = {}; try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
    if (!response.ok) throw new Error(body.message || body.error || text || "That request could not be completed.");
    return body;
  };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const topicLabel = (value) => ({ ceremony_process: "Ceremony process", paperwork: "Paperwork", ceremony_ideas: "Ceremony ideas", finding_celebrant: "Finding a celebrant" })[value] || value;
  const time = (value) => value ? new Date(value).toLocaleString("en-AU", { timeZone: "Australia/Sydney", weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "";
  const render = (payload) => {
    availability = payload.cards || [];
    const live = availability.filter((card) => card.available_now);
    status.textContent = live.length ? `${live.length} celebrant${live.length === 1 ? " is" : "s are"} available now.` : payload.empty_message;
    if (!availability.length) {
      cards.innerHTML = `<div class="celebrant-empty"><h3>No consultation times are published yet</h3><p>The page stays open so you can still browse verified directory listings.</p><a class="btn btn-outline" href="vendors.html">Browse celebrants</a></div>`;
      return;
    }
    cards.innerHTML = availability.map((card) => `<article class="celebrant-card">
      ${card.photo_url ? `<img src="${escape(card.photo_url)}" alt="" loading="lazy" decoding="async">` : `<div class="celebrant-avatar" aria-hidden="true">☎</div>`}
      <div><div>${card.available_now ? `<span class="celebrant-live">Available now</span>` : ""}</div><h3>${escape(card.name)}</h3><p class="celebrant-meta">${escape(card.service_area)} · ${escape((card.languages || []).join(", "))}</p><p class="celebrant-topics">${(card.topics || []).map(topicLabel).map(escape).join(" · ")}</p>${!card.available_now && card.next_available_at ? `<p><strong>Next: ${escape(time(card.next_available_at))}</strong></p>` : ""}</div>
      <div class="celebrant-card-actions">${card.available_now ? `<button class="btn btn-primary" type="button" data-callback="${escape(card.vendor_slug)}">Request a callback</button>` : ""}${card.next_available_at ? `<button class="btn btn-outline" type="button" data-book="${escape(card.vendor_slug)}" data-time="${escape(card.next_available_at)}">Book this time</button>` : ""}</div>
    </article>`).join("");
    if (live.length) cards.insertAdjacentHTML("afterbegin", `<article class="celebrant-card"><div class="celebrant-avatar" aria-hidden="true">↗</div><div><span class="celebrant-live">Available now</span><h3>First available celebrant</h3><p class="celebrant-meta">Choose this when getting an answer matters more than who calls.</p></div><div class="celebrant-card-actions"><button class="btn btn-primary" type="button" data-callback="">Request first available</button></div></article>`);
  };
  const openForm = (vendorSlug, mode, scheduledStart = "") => {
    const selected = availability.find((card) => card.vendor_slug === vendorSlug);
    document.getElementById("selectedVendor").value = vendorSlug;
    document.getElementById("requestMode").value = mode;
    document.getElementById("scheduledStart").value = scheduledStart;
    document.getElementById("intakeTitle").textContent = mode === "scheduled" ? `Book ${selected?.name || "a celebrant"} for ${time(scheduledStart)}` : vendorSlug ? `Request a callback from ${selected?.name || "this celebrant"}` : "Request the first available celebrant";
    document.getElementById("numberNotice").textContent = vendorSlug ? `Your verified number is revealed to ${selected?.name || "the selected celebrant"} only after they accept.` : "Your verified number is revealed only to the first matching celebrant who accepts.";
    form.hidden = false; receipt.hidden = true; verificationId = ""; verificationToken = "";
    document.getElementById("verificationStart").hidden = false; document.getElementById("verificationCheck").hidden = true;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  cards.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-callback],button[data-book]");
    if (!button) return;
    openForm(button.dataset.callback ?? button.dataset.book ?? "", button.dataset.book !== undefined ? "scheduled" : "immediate", button.dataset.time || "");
  });
  document.getElementById("closeIntake").addEventListener("click", () => { form.hidden = true; });
  const setBusy = (button, busy) => { button.disabled = busy; button.textContent = busy ? "Working…" : button.dataset.label; };
  const sendCode = document.getElementById("sendCode"); sendCode.dataset.label = sendCode.textContent;
  sendCode.addEventListener("click", async () => {
    const phone = document.getElementById("consultationPhone").value.trim();
    if (!phone) { document.getElementById("intakeStatus").textContent = "Add the number you want the celebrant to call."; return; }
    setBusy(sendCode, true);
    try { const result = await api("/api/public/wedding/celebrant-consultations/verify/start", { method: "POST", body: JSON.stringify({ phone }) }); verificationId = result.verification_id; document.getElementById("verificationStart").hidden = true; document.getElementById("verificationCheck").hidden = false; document.getElementById("intakeStatus").textContent = "Verification code sent. It expires in ten minutes."; document.getElementById("verificationCode").focus(); }
    catch (error) { document.getElementById("intakeStatus").textContent = error.message; }
    finally { setBusy(sendCode, false); }
  });
  const checkCode = document.getElementById("checkCode"); checkCode.dataset.label = checkCode.textContent;
  checkCode.addEventListener("click", async () => {
    setBusy(checkCode, true);
    try {
      const checked = await api("/api/public/wedding/celebrant-consultations/verify/check", { method: "POST", body: JSON.stringify({ verification_id: verificationId, code: document.getElementById("verificationCode").value.trim() }) });
      verificationToken = checked.verification_token;
      const request = await api("/api/public/wedding/celebrant-consultations/requests", { method: "POST", body: JSON.stringify({ verification_id: verificationId, verification_token: verificationToken, idempotency_key: `public-${crypto.randomUUID()}`, vendor_slug: document.getElementById("selectedVendor").value || null, first_available: !document.getElementById("selectedVendor").value, request_mode: document.getElementById("requestMode").value, intent: form.querySelector('[name="intent"]:checked').value, topic: form.querySelector('[name="topic"]:checked').value, location: document.getElementById("consultationLocation").value.trim() || null, wedding_date: document.getElementById("consultationWeddingDate").value || null, scheduled_start: document.getElementById("scheduledStart").value || null }) });
      activeRequest = { id: request.request_id, token: request.status_token }; form.hidden = true; receipt.hidden = false; document.getElementById("receiptTitle").textContent = request.status === "scheduled" ? "Your call is scheduled" : "Waiting for acceptance"; document.getElementById("receiptDetail").textContent = request.scheduled_start ? `Booked for ${time(request.scheduled_start)}. The celebrant still confirms the call separately from wedding-date availability.` : "A matching celebrant can see the topic. Your phone number remains hidden until they accept."; receipt.scrollIntoView({ behavior: "smooth" }); poll();
    } catch (error) { document.getElementById("intakeStatus").textContent = error.message; }
    finally { setBusy(checkCode, false); }
  });
  const poll = async () => {
    if (!activeRequest) return;
    try { const current = await api(`/api/public/wedding/celebrant-consultations/requests/${encodeURIComponent(activeRequest.id)}?token=${encodeURIComponent(activeRequest.token)}`); document.getElementById("receiptTitle").textContent = current.status === "accepted" ? `${current.celebrant_name || "Your celebrant"} accepted` : current.status === "scheduled" ? "Your call is scheduled" : current.status.replaceAll("_", " "); if (current.status === "accepted") { document.getElementById("receiptDetail").textContent = `${current.celebrant_name || "The celebrant"} will call the verified number from their nominated business phone.`; document.getElementById("connectedButton").hidden = false; document.getElementById("notConnectedButton").hidden = false; return; } if (["passed", "expired", "cancelled", "connected", "not_connected"].includes(current.status)) return; pollTimer = window.setTimeout(poll, 5000); } catch { pollTimer = window.setTimeout(poll, 10000); }
  };
  const outcome = async (value) => { if (!activeRequest) return; await api(`/api/public/wedding/celebrant-consultations/requests/${encodeURIComponent(activeRequest.id)}/outcome`, { method: "POST", body: JSON.stringify({ token: activeRequest.token, outcome: value }) }); window.clearTimeout(pollTimer); document.getElementById("receiptTitle").textContent = value === "connected" ? "Thanks — call connected" : "Sorry you did not connect"; document.getElementById("receiptDetail").textContent = value === "connected" ? "You control whether to save this celebrant or ask about your wedding date next." : "Browse another celebrant or book a later time."; document.getElementById("connectedButton").hidden = true; document.getElementById("notConnectedButton").hidden = true; };
  document.getElementById("connectedButton").addEventListener("click", () => void outcome("connected")); document.getElementById("notConnectedButton").addEventListener("click", () => void outcome("not_connected"));
  api("/api/public/wedding/celebrant-consultations").then(render).catch((error) => { status.textContent = "Live callbacks are not open yet. You can still browse celebrants."; cards.innerHTML = `<div class="celebrant-empty"><p>${escape(error.message)}</p><a class="btn btn-outline" href="vendors.html">Browse celebrants</a></div>`; });
})();
