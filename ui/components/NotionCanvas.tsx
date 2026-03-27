import type { ThreadData } from '../schema';

type NotionCanvasProps = {
  thread: ThreadData;
};

export default function NotionCanvas({ thread }: NotionCanvasProps) {
  return (
    <section className="space-y-4">
      {thread.messages.map((message) => (
        <article key={message.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{message.type}</p>
          <p className="mt-3 text-sm leading-6 text-zinc-200">
            {message.summary ??
              (typeof message.content.output === 'string'
                ? message.content.output
                : typeof message.content.text === 'string'
                  ? message.content.text
                  : 'Structured AFP content can render as rich note blocks here.')}
          </p>
        </article>
      ))}
    </section>
  );
}
