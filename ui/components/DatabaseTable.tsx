import type { ThreadData } from '../schema';

type DatabaseTableProps = {
  thread: ThreadData;
};

export default function DatabaseTable({ thread }: DatabaseTableProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-zinc-800">
      <table className="min-w-full text-left text-sm text-zinc-300">
        <thead className="bg-zinc-900 text-zinc-500">
          <tr>
            <th className="px-4 py-3 font-medium">Message</th>
            <th className="px-4 py-3 font-medium">Type</th>
            <th className="px-4 py-3 font-medium">Actor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800 bg-zinc-950/80">
          {thread.messages.map((message) => (
            <tr key={message.id}>
              <td className="px-4 py-3">{message.id}</td>
              <td className="px-4 py-3">{message.type}</td>
              <td className="px-4 py-3">{message.author}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
