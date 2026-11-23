import { startTransition, useEffect, useState } from 'react';
import config from './config.json';
import EmailView from './components/EmailView';
import NotionCanvas from './components/NotionCanvas';
import DatabaseTable from './components/DatabaseTable';
import CalendarView from './components/CalendarView';
import AttachmentPreview from './components/AttachmentPreview';
import ApprovalQueue from './components/ApprovalQueue';
import SectionWrapper from './components/SectionWrapper';
import {
  demoThread,
  parseAfpThreadResponse,
  parseLayoutConfig,
  type LayoutConfig,
  type LayoutSection,
  type ThreadData,
} from './schema';

type RelayEvent = {
  event?: string;
  thread_id?: string;
};

export default function App() {
  const [layout] = useState<LayoutConfig>(() => parseLayoutConfig(config));
  const [thread, setThread] = useState<ThreadData>(demoThread);
  const [status, setStatus] = useState<'idle' | 'loading' | 'live' | 'fallback'>('idle');

  const homeserverUrl =
    layout.homeserverUrl ??
    (typeof window !== 'undefined' && 'OMNYID_HOMESERVER_URL' in window
      ? String((window as Window & { OMNYID_HOMESERVER_URL?: string }).OMNYID_HOMESERVER_URL ?? '')
      : '');
  const baseUrl =
    homeserverUrl.trim().length > 0 ? homeserverUrl.trim().replace(/\/$/, '') : 'http://localhost:8080';
  const threadId = layout.threadId ?? demoThread.id;

  useEffect(() => {
    const controller = new AbortController();

    setStatus('loading');
    void fetch(`${baseUrl}/thread/${encodeURIComponent(threadId)}`, {
      method: 'GET',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Thread fetch failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((payload) => {
        startTransition(() => {
          const liveThread = parseAfpThreadResponse(payload, threadId);
          if (liveThread.messages.length > 0) {
            setThread(liveThread);
            setStatus('live');
          } else {
            setThread(demoThread);
            setStatus('fallback');
          }
        });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          startTransition(() => {
            setThread(demoThread);
            setStatus('fallback');
          });
        }
      });

    return () => {
      controller.abort();
    };
  }, [baseUrl, threadId]);

  useEffect(() => {
    const relayUrl = baseUrl.startsWith('https://')
      ? `${baseUrl.replace('https://', 'wss://')}/relay/ws`
      : `${baseUrl.replace('http://', 'ws://')}/relay/ws`;
    const socket = new WebSocket(relayUrl);

    const refetchThread = () => {
      void fetch(`${baseUrl}/thread/${encodeURIComponent(threadId)}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Thread refetch failed with status ${response.status}`);
          }
          return response.json();
        })
        .then((payload) => {
          startTransition(() => {
            const liveThread = parseAfpThreadResponse(payload, threadId);
            if (liveThread.messages.length > 0) {
              setThread(liveThread);
              setStatus('live');
            }
          });
        })
        .catch(() => {});
    };

    socket.addEventListener('open', () => {
      socket.send(
        JSON.stringify({
          op: 'subscribe_thread',
          thread_id: threadId,
          include_snapshot: true,
        }),
      );
    });
    socket.addEventListener('message', (messageEvent) => {
      try {
        const event = JSON.parse(String(messageEvent.data)) as RelayEvent;
        if (event.event === 'thread_snapshot' || event.event === 'message_stored') {
          if (!event.thread_id || event.thread_id === threadId) {
            refetchThread();
          }
        }
      } catch {
        return;
      }
    });

    return () => {
      socket.close();
    };
  }, [baseUrl, threadId]);

  const renderSection = (section: LayoutSection) => {
    switch (section.type) {
      case 'email':
        return <EmailView thread={thread} />;
      case 'notion':
        return <NotionCanvas thread={thread} />;
      case 'database':
        return <DatabaseTable thread={thread} />;
      case 'calendar':
        return <CalendarView thread={thread} />;
      case 'attachments':
        return <AttachmentPreview thread={thread} />;
      case 'approvals':
        return <ApprovalQueue thread={thread} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 bg-zinc-950 p-6 text-white">
      <header className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
        <p className="text-sm uppercase tracking-[0.3em] text-zinc-500">Omnyid Workspace</p>
        <h1 className="mt-2 text-3xl font-semibold">{thread.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-zinc-400">
          One AFP thread powers the human inbox view, the agent action log, and the structured
          workspace. Each section below is only a renderer over the same append-only history.
        </p>
        <p className="mt-4 inline-flex rounded-full border border-zinc-800 bg-zinc-950/80 px-3 py-1 text-xs uppercase tracking-[0.2em] text-zinc-400">
          {status === 'live'
            ? 'Live thread'
            : status === 'loading'
              ? 'Loading homeserver'
              : 'Demo fallback'}
        </p>
      </header>

      <div className="grid grid-cols-12 gap-4">
        {layout.sections
          .filter((section) => section.visible)
          .map((section) => (
            <SectionWrapper key={section.id} section={section}>
              {renderSection(section)}
            </SectionWrapper>
          ))}
      </div>
    </div>
  );
}
