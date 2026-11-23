import { useEffect, useState } from 'react';
import { extractApprovalItems, type ApprovalDecision, type ThreadData } from '../schema';

type ApprovalQueueProps = {
  thread: ThreadData;
};

type DecisionState = Record<string, ApprovalDecision>;

const storageKeyPrefix = 'omnyid-approval-decisions';

export default function ApprovalQueue({ thread }: ApprovalQueueProps) {
  const [decisions, setDecisions] = useState<DecisionState>({});
  const [submitting, setSubmitting] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const items = extractApprovalItems(thread);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const raw = window.localStorage.getItem(`${storageKeyPrefix}:${thread.id}`);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as DecisionState;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        setDecisions(parsed);
      }
    } catch {
      return;
    }
  }, [thread.id]);

  const baseUrl =
    typeof window !== 'undefined' && 'OMNYID_HOMESERVER_URL' in window
      ? String((window as Window & { OMNYID_HOMESERVER_URL?: string }).OMNYID_HOMESERVER_URL ?? '')
      : 'http://localhost:8080';

  const persistDecision = async (itemId: string, decision: ApprovalDecision) => {
    const target = items.find((item) => item.id === itemId);
    if (!target) {
      return;
    }

    setSubmitting((current) => ({ ...current, [itemId]: true }));
    setErrors((current) => ({ ...current, [itemId]: '' }));
    setDecisions((current) => {
      const next = {
        ...current,
        [itemId]: decision,
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(`${storageKeyPrefix}:${thread.id}`, JSON.stringify(next));
      }
      return next;
    });

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/actions/decision`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          thread_id: target.threadId,
          target_message_id: target.messageId,
          capability_id: target.details.capability_id,
          decision,
          decided_by: 'agent:human-review@omnyid.com',
          note: `Decision recorded in Omnyid workspace: ${decision}`,
        }),
      });

      if (!response.ok) {
        throw new Error(`Approval request failed with status ${response.status}`);
      }
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [itemId]: error instanceof Error ? error.message : 'Failed to record decision',
      }));
    } finally {
      setSubmitting((current) => ({ ...current, [itemId]: false }));
    }
  };

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 p-5 text-sm text-zinc-400">
        No risky agent actions currently require human review in this thread.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      {items.map((item) => {
        const localDecision = decisions[item.id];
        const isSubmitting = submitting[item.id] === true;
        const effectiveStatus =
          localDecision === 'approved'
            ? 'approved'
            : localDecision === 'rejected'
              ? 'rejected'
              : item.status;

        return (
          <article key={item.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-400">
                  {item.approvalMode.replaceAll('_', ' ')}
                </p>
                <h3 className="mt-1 text-base font-semibold text-zinc-100">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-300">{item.summary}</p>
              </div>
              <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs uppercase tracking-[0.15em] text-zinc-300">
                {effectiveStatus}
              </span>
            </div>

            <dl className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">Action</dt>
                <dd>{item.actionType}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Requested by</dt>
                <dd>{item.requestedBy}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Requested at</dt>
                <dd>{item.requestedAt}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Thread</dt>
                <dd>{item.threadId}</dd>
              </div>
            </dl>

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  void persistDecision(item.id, 'approved');
                }}
                className="rounded-xl border border-emerald-800 bg-emerald-950/80 px-4 py-2 text-sm text-emerald-300 transition hover:bg-emerald-900/80"
              >
                {isSubmitting ? 'Submitting...' : 'Approve'}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  void persistDecision(item.id, 'rejected');
                }}
                className="rounded-xl border border-rose-800 bg-rose-950/80 px-4 py-2 text-sm text-rose-300 transition hover:bg-rose-900/80"
              >
                Reject
              </button>
            </div>
            {errors[item.id] ? <p className="mt-3 text-sm text-rose-400">{errors[item.id]}</p> : null}
          </article>
        );
      })}
    </section>
  );
}
