import { createEffect, createSignal, For, Show } from "solid-js";
import {
  type AddCapabilityFailureReceipt,
} from "@/lib/addCapabilityFailureState";
import {
  duplicateCapabilityFieldIndexes,
  firstDuplicateCapabilityFieldIndex,
  type CapabilityFieldDef,
} from "@/lib/capabilitySchema";
import {
  submitAddCapabilityState,
  validateAddCapabilityInput,
} from "@/lib/addCapabilityState";
import { recordShortcutUse } from "@/lib/shortcutRecency";
import { DialogShell } from "./DialogShell";
import { TiptapEditor } from "@/components/editor/TiptapEditor";

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

export function AddCapabilityModal(props: Props) {
  const [name, setName] = createSignal("");
  const [description, setDescription] = createSignal("");
  const [fields, setFields] = createSignal<CapabilityFieldDef[]>([{ name: "", type: "string" }]);
  const [saving, setSaving] = createSignal(false);
  const [validationError, setValidationError] = createSignal("");
  const [submitError, setSubmitError] = createSignal<AddCapabilityFailureReceipt | null>(null);
  let nameInputRef: HTMLInputElement | undefined;
  let addFieldButtonRef: HTMLButtonElement | undefined;
  const fieldNameInputRefs: Array<HTMLInputElement | undefined> = [];
  const duplicateIndexes = () => duplicateCapabilityFieldIndexes(fields());
  const hasNameValidationError = () => validationError() === "Name is required.";
  const hasDuplicateFieldValidationError = () => validationError() === "Field names must be unique.";

  function clearResolvedValidationError(nextName: string, nextFields: CapabilityFieldDef[]) {
    if (validationError() === "Name is required." && nextName.trim()) {
      setValidationError("");
      return;
    }
    if (validationError() === "Field names must be unique." && firstDuplicateCapabilityFieldIndex(nextFields) === -1) {
      setValidationError("");
      return;
    }
    if (submitError() && !saving()) {
      setSubmitError(null);
    }
  }

  function addField() {
    const nextFieldIndex = fields().length;
    const nextFields = [...fields(), { name: "", type: "string" as const }];
    setFields(nextFields);
    clearResolvedValidationError(name(), nextFields);
    queueMicrotask(() => {
      fieldNameInputRefs[nextFieldIndex]?.focus();
    });
  }

  function removeField(index: number) {
    const nextFields = fields().filter((_, currentIndex) => currentIndex !== index);
    setFields(nextFields);
    clearResolvedValidationError(name(), nextFields);
    queueMicrotask(() => {
      const nextFocusTarget =
        fieldNameInputRefs[index]
        ?? fieldNameInputRefs[index - 1]
        ?? addFieldButtonRef;
      nextFocusTarget?.focus();
    });
  }

  function updateField(index: number, patch: Partial<CapabilityFieldDef>) {
    const nextFields = fields().map((field, currentIndex) => (
      currentIndex === index ? { ...field, ...patch } : field
    ));
    setFields(nextFields);
    clearResolvedValidationError(name(), nextFields);
  }

  function requestClose() {
    if (saving()) return;
    props.onClose();
  }

  function closeAfterSuccess() {
    props.onClose();
  }

  async function submitCapability() {
    if (saving()) return;
    const validation = validateAddCapabilityInput(name(), fields());
    if (validation.kind === "invalid" && validation.validationError === "Name is required.") {
      setValidationError(validation.validationError);
      queueMicrotask(() => {
        nameInputRef?.focus();
        nameInputRef?.select();
      });
      return;
    }

    if (validation.kind === "invalid") {
      setValidationError(validation.validationError);
      queueMicrotask(() => {
        fieldNameInputRefs[validation.duplicateFieldIndex]?.focus();
        fieldNameInputRefs[validation.duplicateFieldIndex]?.select();
      });
      return;
    }

    setSaving(true);
    setValidationError("");
    setSubmitError(null);
    try {
      const result = await submitAddCapabilityState({
        name: name(),
        description: description(),
        fields: fields(),
      });
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
      props.onCreated();
      closeAfterSuccess();
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: Event) {
    event.preventDefault();
    await submitCapability();
  }

  function handleFormShortcut(event: KeyboardEvent) {
    if (event.key === "Escape" && !saving()) {
      event.preventDefault();
      recordShortcutUse("form_cancel");
      requestClose();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      recordShortcutUse("form_submit");
      void submitCapability();
    }
  }

  createEffect(() => {
    queueMicrotask(() => {
      nameInputRef?.focus();
    });
  });

  return (
    <DialogShell
      labelledBy="add-capability-title"
      busy={saving()}
      focusableSelector='button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      overlayClass="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/45 p-4"
      dialogClass=""
      dialogStyle={{
        background: "#fff",
        "border-radius": "20px",
        padding: "28px",
        "max-width": "520px",
        width: "100%",
        "max-height": "min(720px, calc(100vh - 32px))",
        overflow: "auto",
        "box-sizing": "border-box",
        "box-shadow": "0 16px 48px rgba(0,0,0,0.18)",
      }}
      onClose={requestClose}
    >
      <>
        <div style={{ display: "flex", "align-items": "flex-start", gap: "8px", "margin-bottom": "18px" }}>
          <h2 id="add-capability-title" style={{ margin: "0", "font-size": "20px" }}>Add Capability</h2>
          <span
            title="A capability is a named, structured action your agent can perform autonomously or suggest. Example: a 'send_email' capability takes a recipient, subject, and body as inputs and lets your agent draft or send emails on your behalf - with approval gates if you prefer."
            style={{ cursor: "help", "font-size": "14px", color: "#888", "margin-top": "4px", "flex-shrink": "0" }}
          >
            i
          </span>
        </div>
        <form onSubmit={submit} onKeyDown={handleFormShortcut}>
          <label style={{ display: "block", "margin-bottom": "12px" }}>
            <span style={{ "font-size": "13px", color: "#555", display: "flex", "align-items": "center", gap: "5px", "margin-bottom": "4px" }}>
              Name
              <span
                title="A short snake_case identifier for this capability - e.g. 'email_guardian', 'book_meeting', 'summarise_doc'. This is the internal handle agents use when delegating or invoking the action."
                style={{ cursor: "help", "font-size": "12px", color: "#aaa" }}
              >
                i
              </span>
            </span>
            <input
              ref={nameInputRef}
              type="text"
              value={name()}
              onInput={(event) => {
                const nextName = event.currentTarget.value;
                setName(nextName);
                clearResolvedValidationError(nextName, fields());
              }}
              placeholder="e.g. email_guardian"
              spellcheck={false}
              autocapitalize="off"
              autocorrect="off"
              enterkeyhint="next"
              aria-disabled={saving()}
              disabled={saving()}
              aria-invalid={hasNameValidationError()}
              aria-errormessage={hasNameValidationError() ? "add-capability-name-error" : undefined}
              class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ width: "100%", padding: "9px 12px", "border-radius": "10px", border: hasNameValidationError() ? "1px solid #c00" : "1px solid #ccc", "font-size": "14px", "box-sizing": "border-box" }}
            />
            <Show when={hasNameValidationError()}>
              <p
                id="add-capability-name-error"
                role="alert"
                aria-live="assertive"
                style={{ color: "#c00", "font-size": "12px", margin: "6px 0 0" }}
              >
                Name is required.
              </p>
            </Show>
          </label>

          <label style={{ display: "block", "margin-bottom": "16px" }}>
            <span style={{ "font-size": "13px", color: "#555", display: "flex", "align-items": "center", gap: "5px", "margin-bottom": "4px" }}>
              Description
              <span
                title="Explain what this capability does in plain language. Your agent reads this to decide when to use it. Example: 'Scans incoming emails and flags phishing attempts, then archives safe promotional mail automatically.'"
                style={{ cursor: "help", "font-size": "12px", color: "#aaa" }}
              >
                i
              </span>
            </span>
            <TiptapEditor
              mode="compact"
              initialContent={description()}
              disabled={saving()}
              placeholder="What does this capability do?"
              submitLabel={saving() ? "Saving..." : "Create capability"}
              clearOnSend={false}
              onChange={(_text, markdown) => {
                setDescription(markdown);
                clearResolvedValidationError(name(), fields());
              }}
              onSend={async (payload) => {
                setDescription(payload.markdown || payload.text);
                clearResolvedValidationError(name(), fields());
                await submitCapability();
              }}
            />
          </label>

          <div style={{ "margin-bottom": "16px" }}>
            <span style={{ "font-size": "13px", color: "#555", display: "flex", "align-items": "center", gap: "5px", "margin-bottom": "8px" }}>
              Input fields
              <span
                title="Define the data your agent needs to invoke this capability. Each field has a name (e.g. 'recipient') and a type (string, number, boolean, object). Example: 'send_email' might have fields: recipient (string), subject (string), body (string). The agent fills these in automatically from context."
                style={{ cursor: "help", "font-size": "12px", color: "#aaa" }}
              >
                i
              </span>
            </span>
            <For each={fields()}>
              {(field, index) => (
                <div
                  role="group"
                  aria-label={`Input field ${index() + 1}`}
                  aria-invalid={hasDuplicateFieldValidationError() && duplicateIndexes().has(index())}
                  style={{ display: "flex", gap: "8px", "margin-bottom": "8px", "align-items": "center", "flex-wrap": "wrap" }}
                >
                  <input
                    ref={(element) => {
                      fieldNameInputRefs[index()] = element;
                    }}
                    type="text"
                    value={field.name}
                    onInput={(event) => updateField(index(), { name: event.currentTarget.value })}
                    placeholder="field name"
                    spellcheck={false}
                    autocapitalize="off"
                    autocorrect="off"
                    enterkeyhint="next"
                    aria-label={`Field ${index() + 1} name`}
                    aria-invalid={hasDuplicateFieldValidationError() && duplicateIndexes().has(index())}
                    aria-errormessage={hasDuplicateFieldValidationError() && duplicateIndexes().has(index()) ? `add-capability-field-error-${index()}` : undefined}
                    aria-disabled={saving()}
                    disabled={saving()}
                    class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    style={{ flex: "1 1 180px", padding: "7px 10px", "border-radius": "8px", border: hasDuplicateFieldValidationError() && duplicateIndexes().has(index()) ? "1px solid #c00" : "1px solid #ccc", "font-size": "13px", "min-width": "0" }}
                  />
                  <select
                    value={field.type}
                    onChange={(event) => updateField(index(), { type: event.currentTarget.value as CapabilityFieldDef["type"] })}
                    aria-label={`Field ${index() + 1} type`}
                    aria-disabled={saving()}
                    disabled={saving()}
                    class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    style={{ padding: "7px 10px", "border-radius": "8px", border: "1px solid #ccc", "font-size": "13px", flex: "0 1 120px" }}
                  >
                    <option value="string">string</option>
                    <option value="number">number</option>
                    <option value="boolean">boolean</option>
                    <option value="object">object</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => removeField(index())}
                    aria-label={`Remove field ${index() + 1}`}
                    aria-disabled={saving()}
                    disabled={saving()}
                    class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    style={{ background: "none", border: "none", color: "#c00", cursor: "pointer", "font-size": "18px", padding: "0 4px" }}
                  >
                    x
                  </button>
                  <Show when={hasDuplicateFieldValidationError() && duplicateIndexes().has(index())}>
                    <p
                      id={`add-capability-field-error-${index()}`}
                      role="alert"
                      aria-live="assertive"
                      style={{ color: "#c00", "font-size": "12px", margin: "0", flex: "1 0 100%" }}
                    >
                      Field names must be unique.
                    </p>
                  </Show>
                </div>
              )}
            </For>
            <button
              ref={addFieldButtonRef}
              type="button"
              onClick={addField}
              aria-disabled={saving()}
              disabled={saving()}
              class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ background: "none", border: "1px dashed #aaa", "border-radius": "8px", padding: "6px 14px", "font-size": "13px", cursor: "pointer", color: "#555" }}
            >
              + Add field
            </button>
          </div>

          <Show when={submitError()}>
            {(receipt) => (
              <div
                id="add-capability-error"
                role="alert"
                aria-live="assertive"
                style={{
                  color: receipt().tone === "danger" ? "#991b1b" : "#92400e",
                  background: receipt().tone === "danger" ? "#fef2f2" : "#fffbeb",
                  border: receipt().tone === "danger" ? "1px solid #fecaca" : "1px solid #fde68a",
                  "border-radius": "12px",
                  padding: "10px 12px",
                  "font-size": "13px",
                  margin: "0 0 12px",
                }}
              >
                <p style={{ margin: "0", "font-weight": "700" }}>{receipt().title}</p>
                <p style={{ margin: "6px 0 0" }}>{receipt().summary}</p>
                <p style={{ margin: "6px 0 0" }}>{receipt().nextStep}</p>
              </div>
            )}
          </Show>

          <div style={{ display: "flex", gap: "12px", "justify-content": "flex-end", "flex-wrap": "wrap" }}>
            <button
              type="button"
              onClick={requestClose}
              aria-disabled={saving()}
              disabled={saving()}
              class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ padding: "9px 20px", "border-radius": "10px", border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving()}
              aria-busy={saving()}
              aria-disabled={saving()}
              class="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ padding: "9px 20px", "border-radius": "10px", border: "none", background: "#31568e", color: "#fff", "font-weight": "700", cursor: "pointer" }}
            >
              {saving() ? "Saving..." : "Create Capability"}
            </button>
          </div>
        </form>
      </>
    </DialogShell>
  );
}
