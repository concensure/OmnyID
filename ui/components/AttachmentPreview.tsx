import { extractThreadAttachments, formatBytes, type ThreadData } from '../schema';

type AttachmentPreviewProps = {
  thread: ThreadData;
};

export default function AttachmentPreview({ thread }: AttachmentPreviewProps) {
  const attachments = extractThreadAttachments(thread);

  if (attachments.length === 0) {
    return (
      <section className="rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/60 p-5 text-sm text-zinc-400">
        No encrypted attachments are present in this thread yet.
      </section>
    );
  }

  return (
    <section className="space-y-3">
      {attachments.map((attachment) => {
        const encryptionScheme =
          typeof attachment.encryption.scheme === 'string'
            ? attachment.encryption.scheme
            : 'encrypted';
        const storageBackend =
          typeof attachment.storage.backend === 'string'
            ? attachment.storage.backend
            : 'private storage';

        return (
          <article
            key={attachment.id}
            className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Encrypted</p>
                <h3 className="mt-1 text-base font-semibold text-zinc-100">{attachment.name}</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {attachment.mimeType} - {formatBytes(attachment.sizeBytes)}
                </p>
              </div>
              <span className="rounded-full border border-emerald-900/80 bg-emerald-950/70 px-2 py-1 text-xs text-emerald-300">
                Locked
              </span>
            </div>

            <dl className="mt-4 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">Encryption</dt>
                <dd>{encryptionScheme}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Storage</dt>
                <dd>{storageBackend}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Source message</dt>
                <dd>{attachment.messageId}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Timestamp</dt>
                <dd>{attachment.timestamp || 'Unknown'}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </section>
  );
}
