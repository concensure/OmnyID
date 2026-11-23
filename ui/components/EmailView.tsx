import type { ThreadData } from '../schema';
import { formatBytes } from '../schema';

type EmailViewProps = {
  thread: ThreadData;
};

export default function EmailView({ thread }: EmailViewProps) {
  return (
    <section className="space-y-3">
      {thread.messages.map((message) => {
        const subject =
          typeof message.content.subject === 'string'
            ? message.content.subject
            : 'Agent update in shared thread';
        const body =
          typeof message.content.body === 'string'
            ? message.content.body
            : message.summary ?? 'Structured action with no email body.';

        return (
          <article key={message.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-zinc-500">{message.author}</p>
                <h3 className="mt-1 text-base font-semibold">{subject}</h3>
              </div>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                {message.type}
              </span>
            </div>
            <p className="mt-3 text-sm text-zinc-300">{body}</p>
            {message.attachments.length > 0 ? (
              <div className="mt-4 space-y-2">
                {message.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2 text-sm text-zinc-300"
                  >
                    <p className="font-medium text-zinc-100">{attachment.name}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Encrypted attachment · {attachment.mimeType} · {formatBytes(attachment.sizeBytes)}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </section>
  );
}
