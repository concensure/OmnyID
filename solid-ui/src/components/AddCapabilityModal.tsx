import { createSignal, For, Show } from "solid-js";
import { registerCapability } from "@/lib/api";

type FieldDef = { name: string; type: "string" | "number" | "boolean" | "object" };

function buildInputSchema(fields: FieldDef[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    if (!f.name.trim()) continue;
    properties[f.name.trim()] = { type: f.type };
    required.push(f.name.trim());
  }
  return { type: "object", properties, required };
}

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

export function AddCapabilityModal(props: Props) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [fields, setFields] = createSignal<FieldDef[]>([{ name: "", type: "string" }]);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal("");

  function addField() {
    setFields([...fields(), { name: "", type: "string" }]);
  }

  function removeField(i: number) {
    setFields(fields().filter((_, idx) => idx !== i));
  }

  function updateField(i: number, patch: Partial<FieldDef>) {
    setFields(fields().map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!name().trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await registerCapability({
        name: name().trim(),
        description: description().trim(),
        input_schema: buildInputSchema(fields()),
        version: "1.0.0",
        tags: [],
        approval_mode: "suggest_only",
      });
      props.onCreated();
      props.onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create capability.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: "0",
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        "align-items": "center",
        "justify-content": "center",
        "z-index": "50",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
    >
      <div
        style={{
          background: "#fff",
          "border-radius": "20px",
          padding: "28px",
          "max-width": "520px",
          width: "100%",
          "box-shadow": "0 16px 48px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ display: "flex", "align-items": "flex-start", gap: "8px", "margin-bottom": "18px" }}>
          <h2 style={{ margin: "0", "font-size": "20px" }}>Add Capability</h2>
          <span
            title="A capability is a named, structured action your agent can perform autonomously or suggest. Example: a 'send_email' capability takes a recipient, subject, and body as inputs and lets your agent draft or send emails on your behalf — with approval gates if you prefer."
            style={{ cursor: "help", "font-size": "14px", color: "#888", "margin-top": "4px", "flex-shrink": "0" }}
          >ⓘ</span>
        </div>
        <form onSubmit={submit}>
          <label style={{ display: "block", "margin-bottom": "12px" }}>
            <span style={{ "font-size": "13px", color: "#555", display: "flex", "align-items": "center", gap: "5px", "margin-bottom": "4px" }}>
              Name
              <span
                title="A short snake_case identifier for this capability — e.g. 'email_guardian', 'book_meeting', 'summarise_doc'. This is the internal handle agents use when delegating or invoking the action."
                style={{ cursor: "help", "font-size": "12px", color: "#aaa" }}
              >ⓘ</span>
            </span>
            <input
              type="text"
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="e.g. email_guardian"
              style={{ width: "100%", padding: "9px 12px", "border-radius": "10px", border: "1px solid #ccc", "font-size": "14px", "box-sizing": "border-box" }}
            />
          </label>

          <label style={{ display: "block", "margin-bottom": "16px" }}>
            <span style={{ "font-size": "13px", color: "#555", display: "flex", "align-items": "center", gap: "5px", "margin-bottom": "4px" }}>
              Description
              <span
                title="Explain what this capability does in plain language. Your agent reads this to decide when to use it. Example: 'Scans incoming emails and flags phishing attempts, then archives safe promotional mail automatically.'"
                style={{ cursor: "help", "font-size": "12px", color: "#aaa" }}
              >ⓘ</span>
            </span>
            <textarea
              value={description()}
              onInput={(e) => setDescription(e.currentTarget.value)}
              placeholder="What does this capability do?"
              rows={2}
              style={{ width: "100%", padding: "9px 12px", "border-radius": "10px", border: "1px solid #ccc", "font-size": "14px", resize: "vertical", "box-sizing": "border-box" }}
            />
          </label>

          <div style={{ "margin-bottom": "16px" }}>
            <span style={{ "font-size": "13px", color: "#555", display: "flex", "align-items": "center", gap: "5px", "margin-bottom": "8px" }}>
              Input fields
              <span
                title="Define the data your agent needs to invoke this capability. Each field has a name (e.g. 'recipient') and a type (string, number, boolean, object). Example: 'send_email' might have fields: recipient (string), subject (string), body (string). The agent fills these in automatically from context."
                style={{ cursor: "help", "font-size": "12px", color: "#aaa" }}
              >ⓘ</span>
            </span>
            <For each={fields()}>
              {(field, i) => (
                <div style={{ display: "flex", gap: "8px", "margin-bottom": "8px", "align-items": "center" }}>
                  <input
                    type="text"
                    value={field.name}
                    onInput={(e) => updateField(i(), { name: e.currentTarget.value })}
                    placeholder="field name"
                    style={{ flex: "1", padding: "7px 10px", "border-radius": "8px", border: "1px solid #ccc", "font-size": "13px" }}
                  />
                  <select
                    value={field.type}
                    onChange={(e) => updateField(i(), { type: e.currentTarget.value as FieldDef["type"] })}
                    style={{ padding: "7px 10px", "border-radius": "8px", border: "1px solid #ccc", "font-size": "13px" }}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="object">object</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeField(i())}
                    style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", "font-size": "18px", padding: "0 4px" }}
                  >
                    ×
                  </button>
                </div>
              )}
            </For>
            <button
              type="button"
              onClick={addField}
              style={{ background: "none", border: "1px dashed #aaa", "border-radius": "8px", padding: "6px 14px", "font-size": "13px", cursor: "pointer", color: "#555" }}
            >
              + Add field
            </button>
          </div>

          <Show when={error()}>
            <p style={{ color: "#c00", "font-size": "13px", margin: "0 0 12px" }}>{error()}</p>
          </Show>

          <div style={{ display: "flex", gap: "12px", "justify-content": "flex-end" }}>
            <button
              type="button"
              onClick={props.onClose}
              style={{ padding: "9px 20px", "border-radius": "10px", border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving()}
              style={{ padding: "9px 20px", "border-radius": "10px", border: "none", background: "#31568e", color: "#fff", "font-weight": "700", cursor: "pointer" }}
            >
              {saving() ? "Saving…" : "Create Capability"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
