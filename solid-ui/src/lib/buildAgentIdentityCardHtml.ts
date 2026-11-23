// @locs-version: 1.0
export function buildAgentIdentityCardHtml(params: {
  agentId: string;
  model: string;
  provider: string;
  loraScore: string;
  issuedAt: string;
  capabilities: Array<{ id: string; description?: string | null }>;
}): string {
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  const capabilityList = params.capabilities.length > 0
    ? params.capabilities
      .map((capability) => `<li>${escapeHtml(capability.id)}: ${escapeHtml(capability.description)}</li>`)
      .join("")
    : "<li style='color:#888'>No capabilities registered</li>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>OmnyID Agent Identity Card</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:100%}
  body{font-family:Inter,system-ui,sans-serif;background:#f0f3f9;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:2rem}
  .card{width:680px;min-height:360px;background:linear-gradient(135deg,#fff 60%,#e8eef8);border-radius:20px;box-shadow:0 20px 60px rgba(49,86,142,0.18);overflow:hidden;position:relative;display:flex;flex-direction:column}
  .header{background:linear-gradient(135deg,#31568e,#3d6aaa);color:#fff;padding:28px 32px 24px;display:flex;align-items:center;gap:24px}
  .avatar{width:72px;height:72px;border-radius:16px;background:rgba(255,255,255,0.15);border:2px solid rgba(255,255,255,0.35);display:flex;align-items:center;justify-content:center;font-size:2em;flex-shrink:0}
  .header-text h1{font-size:22px;font-weight:700;letter-spacing:-0.02em}
  .header-text p{font-size:11px;opacity:0.7;margin-top:2px;font-family:monospace}
  .badge{display:inline-flex;align-items:center;gap:4px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.3);border-radius:999px;padding:3px 10px;font-size:10px;margin-top:8px;font-family:monospace;letter-spacing:0.05em}
  .body{display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1}
  .col{padding:24px 28px;border-right:1px solid rgba(49,86,142,0.08)}
  .col:last-child{border-right:none}
  .section-label{font-size:9px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#737781;margin-bottom:10px}
  .field{margin-bottom:14px}
  .field-name{font-size:10px;color:#737781;margin-bottom:2px}
  .field-val{font-size:13px;font-weight:600;color:#1a1c1b}
  .field-val.mono{font-family:monospace;font-size:11px;font-weight:400;color:#31568e;word-break:break-all}
  .cap-list{list-style:none;display:flex;flex-direction:column;gap:4px}
  .cap-list li{font-size:11px;color:#434750;padding:4px 8px;background:rgba(49,86,142,0.05);border-radius:6px}
  .footer{background:#f8f9fc;border-top:1px solid rgba(49,86,142,0.08);padding:12px 28px;display:flex;align-items:center;justify-content:space-between}
  .footer p{font-size:9px;color:#737781;font-family:monospace}
  .qr-stub{width:48px;height:48px;background:#31568e;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:8px;font-family:monospace;text-align:center;line-height:1.3}
  @media print{
    @page{margin:0;size:A5 landscape}
    html,body{width:100%;height:auto}
    body{background:#fff;display:block;min-height:auto;padding:0;margin:0}
    .card{
      width:100%;
      min-height:100%;
      border-radius:0;
      box-shadow:none;
      page-break-inside:avoid;
      break-inside:avoid;
      margin:0;
    }
  }
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <div class="avatar">AI</div>
    <div class="header-text">
      <h1>OmnyID Master Agent</h1>
      <p>Agent Identity Card - v1 - AFP-compliant</p>
      <span class="badge">E2EE-Verified - Local-First - Agent-First</span>
    </div>
  </div>
  <div class="body">
    <div class="col">
      <p class="section-label">Identity</p>
      <div class="field"><div class="field-name">Agent ID</div><div class="field-val mono">${escapeHtml(params.agentId)}</div></div>
      <div class="field"><div class="field-name">LLM Model</div><div class="field-val">${escapeHtml(params.model)}</div></div>
      <div class="field"><div class="field-name">Provider</div><div class="field-val">${escapeHtml(params.provider)}</div></div>
      <div class="field"><div class="field-name">LoRA Confidence</div><div class="field-val">${escapeHtml(params.loraScore)}</div></div>
      <div class="field"><div class="field-name">Issued</div><div class="field-val">${escapeHtml(params.issuedAt)}</div></div>
    </div>
    <div class="col">
      <p class="section-label">Capabilities (${params.capabilities.length})</p>
      <ul class="cap-list">${capabilityList}</ul>
    </div>
  </div>
  <div class="footer">
    <div>
      <p>OmnyID - omnyid.com - AFP v1</p>
      <p>This card is a non-binding identity record for the registered agent instance.</p>
    </div>
    <div class="qr-stub">ID<br/>${escapeHtml(params.agentId.slice(-6))}</div>
  </div>
</div>
<script>window.onload=()=>window.print();<\/script>
</body>
</html>`;
}
