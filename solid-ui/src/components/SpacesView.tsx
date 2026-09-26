// @locs-version: 1.0
import { createSignal, For, onMount, Show } from "solid-js";
import { TiptapEditor } from "@/components/editor/TiptapEditor";
import { EmptyState } from "@/components/EmptyState";
import type { AfpAttachment, AfpMessage } from "@/lib/api";
import {
  createSpace as createSpaceRequest,
  fetchSpaceMembers,
  fetchSpaceMessages,
  joinSpace as joinSpaceRequest,
  listSpaces,
  postSpaceMessage,
  readSession,
  uploadAttachmentFile,
} from "@/lib/api";
import type { EditorPayload } from "@/lib/editorPayload";
import { resolveActiveSpaceAfterRefresh, resolveSpaceToOpenAfterRefresh } from "@/lib/spaceSelectionState";
import { AttachmentsRenderer } from "@/components/renderers/AttachmentsRenderer";
import { isCurrentAsyncRequest, nextAsyncRequestId } from "@/lib/asyncRequestState";
import {
  buildSpaceAttachmentMessage,
  extractSpaceMessageAttachments,
  extractSpaceMessageText,
} from "@/lib/spaceMessageContent";
import {
  appendSpaceMessageIfCurrent,
  shouldApplySpaceState,
  shouldShowSpaceScopedPendingState,
  type NormalizedSpace,
  type NormalizedSpaceMember,
  type NormalizedSpaceMessage,
} from "@/lib/spacesViewState";
import {
  buildSpacesFailureReceipt,
  type SpacesFailureReceipt,
} from "@/lib/spacesFailureState";
import {
  surfaceDateTitleLabel,
  surfaceRelativeTimestamp,
  surfaceTimeLabel,
} from "@/lib/surfaceTimestampPresentation";
import {
} from "@/lib/uploadResponseState";

type Space = NormalizedSpace;
export type SpaceMessage = NormalizedSpaceMessage;
type SpaceMember = NormalizedSpaceMember;

export function SpacesView() {
  const [spaces, setSpaces] = createSignal<Space[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [spacesError, setSpacesError] = createSignal<SpacesFailureReceipt | null>(null);
  const [activeSpace, setActiveSpace] = createSignal<Space | null>(null);
  const [messages, setMessages] = createSignal<SpaceMessage[]>([]);
  const [members, setMembers] = createSignal<SpaceMember[]>([]);
  const [messagesLoading, setMessagesLoading] = createSignal(false);
  const [spaceError, setSpaceError] = createSignal<SpacesFailureReceipt | null>(null);

  const [showCreate, setShowCreate] = createSignal(false);
  const [newName, setNewName] = createSignal("");
  const [newDesc, setNewDesc] = createSignal("");
  const [newPublic, setNewPublic] = createSignal(false);
  const [creating, setCreating] = createSignal(false);
  const [createError, setCreateError] = createSignal<SpacesFailureReceipt | null>(null);
  const [joiningSpaceId, setJoiningSpaceId] = createSignal<string | null>(null);

  const [msgInput, setMsgInput] = createSignal("");
  const [posting, setPosting] = createSignal(false);
  const [postingSpaceId, setPostingSpaceId] = createSignal<string | null>(null);
  const [postError, setPostError] = createSignal<SpacesFailureReceipt | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = createSignal(false);
  const [uploadingAttachmentSpaceId, setUploadingAttachmentSpaceId] = createSignal<string | null>(null);
  let fileInputRef!: HTMLInputElement;
  let spacesLoadRequestId = 0;
  let spaceOpenRequestId = 0;

  async function loadSpaces(): Promise<Space[] | null> {
    const requestId = nextAsyncRequestId(spacesLoadRequestId);
    spacesLoadRequestId = requestId;
    setLoading(true);
    setSpacesError(null);
    try {
      const nextSpaces = await listSpaces();
      if (!isCurrentAsyncRequest(spacesLoadRequestId, requestId)) return null;
      setSpaces(nextSpaces);
      const refreshedActiveSpace = resolveActiveSpaceAfterRefresh(activeSpace()?.id, nextSpaces);
      if (activeSpace()?.id && !refreshedActiveSpace) {
        setActiveSpace(null);
        setMessages([]);
        setMembers([]);
        setMessagesLoading(false);
        setSpaceError(null);
        setPostError(null);
      } else if (refreshedActiveSpace) {
        setActiveSpace(refreshedActiveSpace);
      }
      return nextSpaces;
    } catch (e: unknown) {
      if (!isCurrentAsyncRequest(spacesLoadRequestId, requestId)) return null;
      setSpaces([]);
      setSpacesError(
        buildSpacesFailureReceipt(
          "Load spaces",
          e instanceof Error ? e.message : "Failed to load spaces.",
        ),
      );
      return null;
    } finally {
      if (isCurrentAsyncRequest(spacesLoadRequestId, requestId)) {
        setLoading(false);
      }
    }
  }

  async function openSpace(space: Space) {
    const requestedSpaceId = space.id;
    const requestId = nextAsyncRequestId(spaceOpenRequestId);
    spaceOpenRequestId = requestId;
    setActiveSpace(space);
    setMessagesLoading(true);
    setSpaceError(null);
    setPostError(null);
    try {
      const [msgData, memData] = await Promise.all([
        fetchSpaceMessages(space.id, 50),
        fetchSpaceMembers(space.id),
      ]);
      if (!isCurrentAsyncRequest(spaceOpenRequestId, requestId)) return;
      if (!shouldApplySpaceState(activeSpace()?.id, requestedSpaceId)) return;
      setMessages(msgData.reverse());
      setMembers(memData);
    } catch (e: unknown) {
      if (!isCurrentAsyncRequest(spaceOpenRequestId, requestId)) return;
      if (!shouldApplySpaceState(activeSpace()?.id, requestedSpaceId)) return;
      setMessages([]);
      setMembers([]);
      setSpaceError(
        buildSpacesFailureReceipt(
          "Load space",
          e instanceof Error ? e.message : "Failed to load this space.",
        ),
      );
    }
    if (
      isCurrentAsyncRequest(spaceOpenRequestId, requestId)
      && shouldApplySpaceState(activeSpace()?.id, requestedSpaceId)
    ) {
      setMessagesLoading(false);
    }
  }

  async function createSpace() {
    if (creating()) return;
    if (!newName().trim()) {
      setCreateError(buildSpacesFailureReceipt("Create space", "Name is required."));
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const createdSpace = await createSpaceRequest({
        name: newName().trim(),
        description: newDesc().trim() || undefined,
        is_public: newPublic(),
      });
      setNewName("");
      setNewDesc("");
      setNewPublic(false);
      setShowCreate(false);
      const refreshedSpaces = await loadSpaces();
      const createdSpaceToOpen = resolveSpaceToOpenAfterRefresh(
        createdSpace.id,
        refreshedSpaces ?? [],
        createdSpace,
      );
      if (createdSpaceToOpen) {
        await openSpace(createdSpaceToOpen);
      }
    } catch (e: unknown) {
      setCreateError(
        buildSpacesFailureReceipt(
          "Create space",
          e instanceof Error ? e.message : "Failed to create space",
        ),
      );
    }
    setCreating(false);
  }

  async function joinSpace(space: Space) {
    if (joiningSpaceId() === space.id) return;
    setJoiningSpaceId(space.id);
    setSpacesError(null);
    try {
      await joinSpaceRequest(space.id);
      const refreshedSpaces = await loadSpaces();
      const joinedSpaceToOpen = resolveSpaceToOpenAfterRefresh(space.id, refreshedSpaces ?? [], space);
      if (joinedSpaceToOpen) {
        await openSpace(joinedSpaceToOpen);
      }
    } catch (e: unknown) {
      setSpacesError(
        buildSpacesFailureReceipt(
          "Join space",
          e instanceof Error ? e.message : "Failed to join space.",
        ),
      );
    } finally {
      if (joiningSpaceId() === space.id) setJoiningSpaceId(null);
    }
  }

  async function postMessage(payload?: EditorPayload) {
    const space = activeSpace();
    const markdown = payload?.markdown ?? "";
    const text = payload?.text ?? msgInput().trim();
    if (!space || !text) return;
    const targetSpaceId = space.id;
    setPosting(true);
    setPostingSpaceId(targetSpaceId);
    setPostError(null);
    try {
      const msgId = crypto.randomUUID();
      const createdMessage = await postSpaceMessage(space.id, {
        afp_message_id: msgId,
        from_agent: "user",
        type: "text",
        content: payload ? { markdown, text } : { text },
      });
      setMessages((prev) =>
        appendSpaceMessageIfCurrent(prev, activeSpace()?.id, targetSpaceId, createdMessage)
      );
      setMsgInput("");
    } catch (e: unknown) {
      if (shouldApplySpaceState(activeSpace()?.id, targetSpaceId)) {
        setPostError(
          buildSpacesFailureReceipt(
            "Post message",
            e instanceof Error ? e.message : "Failed to post message.",
          ),
        );
      }
    }
    if (postingSpaceId() === targetSpaceId) setPostingSpaceId(null);
    setPosting(false);
  }

  async function attachFiles(fileList: FileList | File[]) {
    const space = activeSpace();
    const files = Array.from(fileList ?? []);
    const token = readSession()?.token;
    if (!space || files.length === 0) return;
    const targetSpaceId = space.id;
    if (!token) {
      setPostError(
        buildSpacesFailureReceipt(
          "Attach file",
          "Sign in again before uploading attachments to this space.",
        ),
      );
      return;
    }
    setUploadingAttachment(true);
    setUploadingAttachmentSpaceId(targetSpaceId);
    setPostError(null);
    try {
      for (const file of files) {
        const attachment = await uploadAttachmentFile(file, { token, filename: file.name });
        const messagePayload = {
          text: `Attached ${attachment.name}`,
          summary: `Attached ${attachment.name}`,
          attachments: [attachment],
        };
        const createdMessage = await postSpaceMessage(space.id, {
          afp_message_id: crypto.randomUUID(),
          from_agent: "user",
          type: "file",
          subtype: "attachment",
          content: messagePayload,
        });
        setMessages((prev) =>
          appendSpaceMessageIfCurrent(prev, activeSpace()?.id, targetSpaceId, createdMessage)
        );
      }
    } catch (e: unknown) {
      if (shouldApplySpaceState(activeSpace()?.id, targetSpaceId)) {
        setPostError(
          buildSpacesFailureReceipt(
            "Attach file",
            e instanceof Error ? e.message : "Failed to attach file.",
          ),
        );
      }
    } finally {
      if (fileInputRef) fileInputRef.value = "";
      if (uploadingAttachmentSpaceId() === targetSpaceId) setUploadingAttachmentSpaceId(null);
      setUploadingAttachment(false);
    }
  }

  onMount(loadSpaces);

  return (
    <div class="flex h-full min-h-[500px] gap-4">
      <div class="w-64 flex-shrink-0 space-y-3">
        <div class="flex items-center justify-between">
          <h2 class="text-sm font-semibold text-on-surface">Spaces</h2>
          <button
            type="button"
            onClick={() => {
              setShowCreate((v) => !v);
              setCreateError(null);
            }}
            class="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary/80"
          >
            {showCreate() ? "Cancel" : "+ New"}
          </button>
        </div>

        <Show when={showCreate()}>
          <div class="space-y-2 rounded-xl border border-white/45 bg-white/12 p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">
            <input
              type="text"
              placeholder="Space name"
              value={newName()}
              disabled={creating()}
              onInput={(e) => {
                setNewName(e.currentTarget.value);
                setCreateError(null);
              }}
              class="w-full rounded-lg border border-white/50 bg-white/18 px-2.5 py-1.5 text-xs text-on-surface placeholder-on-surface-variant outline-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)] focus:border-primary/80"
            />
            <TiptapEditor
              mode="compact"
              initialContent={newDesc()}
              disabled={creating()}
              placeholder="Description (optional)"
              showToolbar={false}
              showFooter={false}
              submitShortcut="none"
              clearOnSend={false}
              appearance="minimal"
              class="border-white/50 bg-white/18"
              contentClass="min-h-[3.75rem] text-xs"
              onChange={(_text, markdown) => {
                setNewDesc(markdown);
                setCreateError(null);
              }}
              onSend={async () => {}}
            />
            <label class="flex cursor-pointer items-center gap-2 text-xs text-on-surface-variant">
              <input
                type="checkbox"
                checked={newPublic()}
                disabled={creating()}
                onChange={(e) => setNewPublic(e.currentTarget.checked)}
                class="accent-primary"
              />
              Public space
            </label>
            <Show when={createError()}>
              <FailureNotice receipt={createError()} compact onDismiss={() => setCreateError(null)} />
            </Show>
            <button
              type="button"
              disabled={creating()}
              onClick={createSpace}
              class="w-full rounded-lg bg-primary py-1.5 text-xs font-medium text-white transition hover:bg-primary/80 disabled:opacity-40"
            >
              {creating() ? "Creating..." : "Create"}
            </button>
          </div>
        </Show>

        <Show when={loading()}>
          <p class="text-xs text-on-surface-variant">Loading...</p>
        </Show>

        <div class="space-y-1">
          <For
            each={spaces()}
            fallback={
              <Show
                when={!spacesError()}
                fallback={
                  <EmptyState
                    icon="SP"
                    title={spacesError()?.title ?? "Could not load spaces"}
                    body={`${spacesError()?.summary ?? "Spaces are unavailable right now."} ${spacesError()?.nextStep ?? ""}`.trim()}
                    action={
                      <button
                        type="button"
                        onClick={() => void loadSpaces()}
                        class="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary/80"
                      >
                        Retry spaces
                      </button>
                    }
                  />
                }
              >
                <div class="space-y-2">
                  <p class="text-xs text-on-surface-variant">No spaces yet.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreate(true);
                      setCreateError(null);
                    }}
                    class="rounded-lg bg-primary px-2.5 py-1 text-xs font-medium text-white transition hover:bg-primary/80"
                  >
                    + Create a space
                  </button>
                </div>
              </Show>
            }
          >
            {(space) => (
              <button
                type="button"
                onClick={() => void openSpace(space)}
                class={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                  activeSpace()?.id === space.id
                    ? "border-primary bg-primary/10 text-on-surface"
                    : "border-white/15 bg-white/5 text-on-surface-variant hover:bg-white/10"
                }`}
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-xs font-semibold">{space.name}</p>
                    <Show when={space.description}>
                      <p class="mt-0.5 truncate text-[10px] opacity-70">{space.description}</p>
                    </Show>
                  </div>
                  <Show when={space.is_public}>
                    <button
                      type="button"
                      disabled={joiningSpaceId() === space.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void joinSpace(space);
                      }}
                      class="rounded-md border border-green-500/25 bg-green-500/10 px-1.5 py-0.5 text-[9px] text-green-400 transition hover:bg-green-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {joiningSpaceId() === space.id ? "Joining..." : "Join"}
                    </button>
                  </Show>
                </div>
                <div class="mt-1 flex items-center gap-1.5">
                  <Show when={space.is_public}>
                    <span class="rounded-full bg-green-500/15 px-1.5 py-0.5 text-[9px] text-green-400">Public</span>
                  </Show>
                  <span class="text-[9px] opacity-50" title={surfaceDateTitleLabel(space.updated_at)}>
                    {surfaceRelativeTimestamp(space.updated_at)}
                  </span>
                </div>
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="flex min-w-0 flex-1 flex-col rounded-xl border border-white/20 bg-white/5">
        <Show when={!activeSpace()}>
          <div class="flex flex-1 items-center justify-center">
            <div class="text-center">
              <p class="text-sm text-on-surface-variant">Select a space to view messages</p>
              <p class="mt-1 text-xs text-on-surface-variant/60">
                Spaces are persistent AFP collaboration rooms shared between agents and users.
                For example, use a space to coordinate a project with your AI assistant and teammates | all messages and decisions stay in one place.
              </p>
            </div>
          </div>
        </Show>

        <Show when={activeSpace()}>
          <div class="flex items-center justify-between border-b border-white/15 px-4 py-3">
            <div>
              <h3 class="text-sm font-semibold text-on-surface">{activeSpace()!.name}</h3>
              <Show when={activeSpace()!.description}>
                <p class="text-[10px] text-on-surface-variant">{activeSpace()!.description}</p>
              </Show>
            </div>
            <div class="flex items-center gap-2 text-[10px] text-on-surface-variant">
              <span>
                {members().length} member{members().length !== 1 ? "s" : ""}
              </span>
              <For each={members().slice(0, 4)}>
                {(member) => (
                  <span
                    title={member.role}
                    class="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white/15 font-mono text-[9px]"
                  >
                    {(member.agent_id ?? member.role ?? member.user_id).slice(0, 2).toUpperCase()}
                  </span>
                )}
              </For>
            </div>
          </div>

          <div class="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            <Show when={messagesLoading()}>
              <p class="text-xs text-on-surface-variant">Loading messages...</p>
            </Show>

            <Show when={!messagesLoading() && spaceError()}>
              <EmptyState
                icon="SP"
                title={spaceError()?.title ?? "Could not load this space"}
                body={`${spaceError()?.summary ?? "This space is unavailable right now."} ${spaceError()?.nextStep ?? ""}`.trim()}
                action={
                  <button
                    type="button"
                    onClick={() => activeSpace() && void openSpace(activeSpace()!)}
                    class="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition hover:bg-primary/80"
                  >
                    Retry space
                  </button>
                }
              />
            </Show>

            <For
              each={spaceError() ? [] : messages()}
              fallback={
                <Show when={!spaceError()}>
                  <div class="py-6 text-center">
                    <p class="text-xs text-on-surface-variant">No messages yet.</p>
                    <p class="mt-1 text-[10px] text-on-surface-variant/60">
                      Messages here are visible to all members and stored as shared collaboration messages in this space.
                    </p>
                  </div>
                </Show>
              }
            >
              {(msg) => (
                <div class="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                  <div class="mb-1 flex items-center gap-2">
                    <span class="font-mono text-[10px] font-semibold text-primary">{msg.from_agent}</span>
                    <span class="text-[9px] text-on-surface-variant/50">{surfaceTimeLabel(msg.created_at)}</span>
                    <Show when={msg.subtype}>
                      <span class="rounded-full border border-white/10 px-1.5 text-[9px] text-on-surface-variant">{msg.subtype}</span>
                    </Show>
                  </div>
                  <SpaceMessageBody content={msg.content} type={msg.type} messageId={msg.id} />
                </div>
              )}
            </For>
          </div>

          <div class="border-t border-white/15 px-4 py-3">
            <Show when={postError()}>
              <div class="mb-2">
                <FailureNotice receipt={postError()} onDismiss={() => setPostError(null)} />
              </div>
            </Show>
            <input
              ref={fileInputRef!}
              type="file"
              class="hidden"
              multiple
              onChange={(event) => void attachFiles(event.currentTarget.files ?? [])}
            />
            <div class="flex items-end gap-2">
              <div class="flex-1">
                <TiptapEditor
                  mode="compact"
                  disabled={shouldShowSpaceScopedPendingState(activeSpace()?.id, postingSpaceId())}
                  placeholder="Message this space..."
                  submitLabel={
                    shouldShowSpaceScopedPendingState(activeSpace()?.id, postingSpaceId())
                      ? "Sending..."
                      : "Send"
                  }
                  mentionSuggestions={members().map((member) => ({
                    id: member.id,
                    label: member.agent_id ?? member.user_id ?? member.id,
                  }))}
                  onSend={async (payload) => {
                    await postMessage(payload);
                  }}
                />
              </div>
              <button
                type="button"
                disabled={
                  shouldShowSpaceScopedPendingState(activeSpace()?.id, uploadingAttachmentSpaceId())
                  || shouldShowSpaceScopedPendingState(activeSpace()?.id, postingSpaceId())
                }
                title="Attach files to this space"
                onClick={() => fileInputRef.click()}
                aria-label="Attach files to this space"
                class="mb-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-white/20 bg-white/10 text-sm text-on-surface-variant transition hover:bg-white/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {shouldShowSpaceScopedPendingState(activeSpace()?.id, uploadingAttachmentSpaceId())
                  || shouldShowSpaceScopedPendingState(activeSpace()?.id, postingSpaceId())
                  ? "..."
                  : "+"}
              </button>
            </div>
          </div>
        </Show>
      </div>
    </div>
  );
}

function SpaceMessageBody(props: { content: Record<string, unknown>; type: string; messageId?: string }) {
  const text = () => extractSpaceMessageText(props.content);
  const attachments = () => extractSpaceMessageAttachments(props.content);
  const pseudoMessage = (): AfpMessage =>
    buildSpaceAttachmentMessage(props.content, props.type, props.messageId ?? "attachment");

  return (
    <div class="space-y-2">
      <Show when={text() !== null}>
        <p class="whitespace-pre-wrap text-xs text-on-surface">{text()}</p>
      </Show>
      <Show when={attachments().length > 0}>
        <AttachmentsRenderer message={pseudoMessage()} />
      </Show>
      <Show when={text() === null && attachments().length === 0}>
        <details class="text-xs text-on-surface-variant">
          <summary class="cursor-pointer text-[10px] text-on-surface-variant/60 transition hover:text-on-surface-variant">
            Structured message | view raw
          </summary>
          <pre class="mt-1 overflow-x-auto rounded bg-white/5 p-2 font-mono text-[10px] leading-relaxed">
            {JSON.stringify(props.content, null, 2)}
          </pre>
        </details>
      </Show>
    </div>
  );
}

function FailureNotice(props: {
  receipt: SpacesFailureReceipt | null;
  onDismiss: () => void;
  compact?: boolean;
}) {
  return (
    <Show when={props.receipt}>
      {(receipt) => (
        <div
          classList={{
            "rounded-lg border px-3 py-2 text-left": true,
            "border-rose-400/35 bg-rose-500/10 text-rose-100": receipt().tone === "danger",
            "border-amber-400/35 bg-amber-500/10 text-amber-100": receipt().tone !== "danger",
          }}
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-semibold">{receipt().title}</p>
              <p class="mt-0.5 text-[11px] leading-relaxed opacity-90">{receipt().summary}</p>
              <Show when={!props.compact}>
                <p class="mt-1 text-[11px] leading-relaxed opacity-75">{receipt().nextStep}</p>
              </Show>
            </div>
            <button
              type="button"
              onClick={props.onDismiss}
              class="shrink-0 rounded-md border border-current/20 px-1.5 py-0.5 text-[10px] opacity-80 transition hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </Show>
  );
}
