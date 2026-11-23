import type { ThreadData } from '../schema';

type CalendarViewProps = {
  thread: ThreadData;
};

export default function CalendarView({ thread }: CalendarViewProps) {
  return (
    <section className="space-y-3">
      {thread.messages.map((message) => (
        <article key={message.id} className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">{message.timestamp}</p>
          <p className="mt-2 text-sm text-zinc-200">
            {message.summary ?? 'Calendar-oriented AFP views can project deadlines and reminders here.'}
          </p>
        </article>
      ))}
    </section>
  );
}
