export type SectionWidth = '1/3' | '2/3' | 'full';
export type SectionType = 'email' | 'notion' | 'database' | 'calendar' | 'attachments' | 'approvals';

export type LayoutSection = {
  id: string;
  type: SectionType;
  title: string;
  width: SectionWidth;
  visible: boolean;
  defaultView?: string;
};

export type LayoutConfig = {
  layout: 'grid';
  sections: LayoutSection[];
  theme: string;
  threadId?: string;
  homeserverUrl?: string;
};

export type ThreadMessage = {
  id: string;
  type: string;
  author: string;
  timestamp: string;
  content: Record<string, unknown>;
  summary?: string;
  attachments: ThreadAttachment[];
};

export type ThreadData = {
  id: string;
  title: string;
  messages: ThreadMessage[];
};

export type ThreadAttachment = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storage: Record<string, unknown>;
  encryption: Record<string, unknown>;
  sha256?: string;
};

export type ApprovalDecision = 'approved' | 'rejected';

export type ApprovalItem = {
  id: string;
  messageId: string;
  threadId: string;
  actionType: string;
  title: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed' | 'failed';
  requestedBy: string;
  requestedAt: string;
  approvalMode: string;
  details: Record<string, unknown>;
};

type AfpProtoMessage = {
  id?: string;
  thread_id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  content?: string;
  attachments?: unknown[];
};

type AfpThreadResponse = {
  messages?: AfpProtoMessage[];
};

type AfpAppMessage = {
  id?: string;
  thread_id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  content?: Record<string, unknown>;
  attachments?: unknown[];
};

const allowedSectionTypes = new Set<SectionType>([
  'email',
  'notion',
  'database',
  'calendar',
  'attachments',
  'approvals',
]);
const allowedWidths = new Set<SectionWidth>(['1/3', '2/3', 'full']);

export function parseLayoutConfig(raw: unknown): LayoutConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Omnyid UI config must be an object');
  }

  const config = raw as Record<string, unknown>;
  const sectionsRaw = Array.isArray(config.sections) ? config.sections : [];
  const sections = sectionsRaw
    .map((section) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        return null;
      }

      const candidate = section as Record<string, unknown>;
      const type = String(candidate.type ?? '');
      const width = String(candidate.width ?? '');
      if (!allowedSectionTypes.has(type as SectionType)) {
        return null;
      }
      if (!allowedWidths.has(width as SectionWidth)) {
        return null;
      }

      return {
        id: String(candidate.id ?? ''),
        type: type as SectionType,
        title: String(candidate.title ?? type),
        width: width as SectionWidth,
        visible: candidate.visible !== false,
        defaultView:
          typeof candidate.defaultView === 'string' ? candidate.defaultView : undefined,
      } satisfies LayoutSection;
    })
    .filter((section): section is LayoutSection => Boolean(section && section.id));

  return {
    layout: 'grid',
    sections,
    theme: String(config.theme ?? 'dark'),
    threadId: typeof config.threadId === 'string' ? config.threadId : undefined,
    homeserverUrl: typeof config.homeserverUrl === 'string' ? config.homeserverUrl : undefined,
  };
}

function parseMessageContent(raw: string | undefined): Record<string, unknown> {
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function normalizeContent(
  raw: string | Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!raw) {
    return {};
  }
  if (typeof raw === 'string') {
    return parseMessageContent(raw);
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw;
  }
  return {};
}

function summarizeContent(content: Record<string, unknown>): string | undefined {
  if (typeof content.summary === 'string' && content.summary.trim().length > 0) {
    return content.summary;
  }
  if (typeof content.output === 'string' && content.output.trim().length > 0) {
    return content.output;
  }
  if (typeof content.body === 'string' && content.body.trim().length > 0) {
    return content.body;
  }
  return undefined;
}

function normalizeAttachments(raw: unknown): ThreadAttachment[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((attachment) => {
      if (!attachment || typeof attachment !== 'object' || Array.isArray(attachment)) {
        return null;
      }

      const candidate = attachment as Record<string, unknown>;
      return {
        id: String(candidate.id ?? ''),
        name: String(candidate.name ?? 'Encrypted attachment'),
        mimeType: String(candidate.mime_type ?? 'application/octet-stream'),
        sizeBytes:
          typeof candidate.size_bytes === 'number' && Number.isFinite(candidate.size_bytes)
            ? candidate.size_bytes
            : 0,
        storage:
          candidate.storage && typeof candidate.storage === 'object' && !Array.isArray(candidate.storage)
            ? (candidate.storage as Record<string, unknown>)
            : {},
        encryption:
          candidate.encryption &&
          typeof candidate.encryption === 'object' &&
          !Array.isArray(candidate.encryption)
            ? (candidate.encryption as Record<string, unknown>)
            : {},
        sha256: typeof candidate.sha256 === 'string' ? candidate.sha256 : undefined,
      } satisfies ThreadAttachment;
    })
    .filter((attachment): attachment is ThreadAttachment => Boolean(attachment && attachment.id));
}

function looksRiskyAction(actionType: string, content: Record<string, unknown>): boolean {
  const normalized = actionType.toLowerCase();
  if (
    normalized.includes('reply') ||
    normalized.includes('forward') ||
    normalized.includes('payment') ||
    normalized.includes('charge') ||
    normalized.includes('book') ||
    normalized.includes('delete') ||
    normalized.includes('destroy')
  ) {
    return true;
  }

  const operation = typeof content.operation === 'string' ? content.operation.toLowerCase() : '';
  return (
    operation.includes('reply') ||
    operation.includes('forward') ||
    operation.includes('payment') ||
    operation.includes('charge') ||
    operation.includes('book') ||
    operation.includes('delete')
  );
}

function actionStatus(content: Record<string, unknown>): ApprovalItem['status'] {
  const rawStatus = typeof content.status === 'string' ? content.status.toLowerCase() : '';
  if (rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'completed' || rawStatus === 'failed') {
    return rawStatus;
  }
  return 'pending';
}

function approvalDecisionOverrides(thread: ThreadData): Record<string, ApprovalItem['status']> {
  return thread.messages.reduce<Record<string, ApprovalItem['status']>>((acc, message) => {
    if (message.type !== 'action_approval_decision') {
      return acc;
    }

    const targetMessageId =
      typeof message.content.target_message_id === 'string'
        ? message.content.target_message_id
        : undefined;
    const status = actionStatus(message.content);
    if (targetMessageId) {
      acc[targetMessageId] = status;
    }
    return acc;
  }, {});
}

function approvalTitle(message: ThreadMessage): string {
  if (typeof message.content.title === 'string' && message.content.title.trim().length > 0) {
    return message.content.title;
  }
  if (typeof message.content.subject === 'string' && message.content.subject.trim().length > 0) {
    return message.content.subject;
  }

  return message.type.replaceAll('_', ' ');
}

function threadTitleFromMessages(threadId: string, messages: ThreadMessage[]): string {
  const firstSubject = messages.find(
    (message) => typeof message.content.subject === 'string' && message.content.subject.length > 0,
  );
  if (firstSubject && typeof firstSubject.content.subject === 'string') {
    return firstSubject.content.subject;
  }

  return threadId.replaceAll('_', ' ');
}

export function parseAfpThreadResponse(raw: unknown, fallbackThreadId = 'omnyid-thread'): ThreadData {
  const payload =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as AfpThreadResponse) : {};
  const sourceMessages: Array<AfpProtoMessage | AfpAppMessage> = Array.isArray(raw)
    ? (raw as AfpAppMessage[])
    : Array.isArray(payload.messages)
      ? payload.messages
      : [];
  const messages = sourceMessages.map((message) => {
    const content = normalizeContent(message.content);
    return {
      id: String(message.id ?? ''),
      type: String(message.type ?? 'unknown'),
      author: String(message.from ?? 'unknown'),
      timestamp: String(message.timestamp ?? ''),
      content,
      summary: summarizeContent(content),
      attachments: normalizeAttachments(message.attachments),
    } satisfies ThreadMessage;
  });

  const threadId =
    sourceMessages.find((message) => typeof message.thread_id === 'string')?.thread_id ??
    fallbackThreadId;

  return {
    id: threadId,
    title: threadTitleFromMessages(threadId, messages),
    messages,
  };
}

export function formatBytes(sizeBytes: number): string {
  if (sizeBytes <= 0) {
    return 'Unknown size';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  if (sizeBytes < 1024 * 1024) {
    return `${(sizeBytes / 1024).toFixed(1)} KB`;
  }
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extractThreadAttachments(thread: ThreadData): Array<ThreadAttachment & { messageId: string; timestamp: string }> {
  return thread.messages.flatMap((message) =>
    message.attachments.map((attachment) => ({
      ...attachment,
      messageId: message.id,
      timestamp: message.timestamp,
    })),
  );
}

export function extractApprovalItems(thread: ThreadData): ApprovalItem[] {
  const decisionOverrides = approvalDecisionOverrides(thread);
  return thread.messages
    .filter((message) => {
      if (message.type === 'action_approval_decision') {
        return false;
      }
      const approvalMode =
        typeof message.content.approval_mode === 'string' ? message.content.approval_mode : '';
      return (
        approvalMode === 'human_approval_required' ||
        approvalMode === 'suggest_only' ||
        looksRiskyAction(message.type, message.content)
      );
    })
    .map((message) => {
      const approvalMode =
        typeof message.content.approval_mode === 'string'
          ? message.content.approval_mode
          : 'human_approval_required';
      return {
        id: `approval_${message.id}`,
        messageId: message.id,
        threadId: thread.id,
        actionType: message.type,
        title: approvalTitle(message),
        summary:
          message.summary ??
          (typeof message.content.reason === 'string'
            ? message.content.reason
            : 'This action needs a human decision before execution.'),
        status: decisionOverrides[message.id] ?? actionStatus(message.content),
        requestedBy: message.author,
        requestedAt: message.timestamp,
        approvalMode,
        details: message.content,
      } satisfies ApprovalItem;
    });
}

export const demoThread: ThreadData = {
  id: 'thread_travel_invoice_2026',
  title: 'Travel approval and invoice triage',
  messages: [
    {
      id: 'msg_email_01',
      type: 'email_incoming',
      author: 'finance@vendor.com',
      timestamp: '2026-03-20T09:00:00Z',
      content: {
        subject: 'Invoice for conference travel',
        body: 'Please process invoice INV-2026-110 before Friday.',
        labels: ['finance', 'travel'],
      },
      summary: 'Vendor invoice arrived and needs payment this week.',
      attachments: [
        {
          id: 'att_invoice_pdf',
          name: 'invoice-2026-110.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 348122,
          storage: {
            backend: 'seaweedfs',
            bucket: 'attachments',
            object_key: 'thread_travel_invoice_2026/att_invoice_pdf',
          },
          encryption: {
            scheme: 'omnyid-envelope-v1',
            algorithm: 'xchacha20poly1305-ietf',
          },
          sha256: '3a6eb0790f39ac87c94f3856b2dd2c5d110e6811602261a9a923d3bb23adc8b7',
        },
      ],
    },
    {
      id: 'msg_summary_02',
      type: 'action_summarise',
      author: 'agent:assistant@omnyid.ai',
      timestamp: '2026-03-20T09:01:00Z',
      content: {
        style: 'brief',
        output: 'Invoice is valid, amount matches prior approval, and payment is due Friday.',
      },
      summary: 'Agent generated a brief finance summary.',
      attachments: [],
    },
    {
      id: 'msg_reply_03',
      type: 'action_reply',
      author: 'agent:assistant@omnyid.ai',
      timestamp: '2026-03-20T09:02:00Z',
      content: {
        body: 'Approved. We will process the travel invoice today.',
        to: ['finance@vendor.com'],
      },
      summary: 'Reply drafted for the external sender.',
      attachments: [],
    },
    {
      id: 'msg_approval_04',
      type: 'action_stripe_charge',
      author: 'agent:finance@omnyid.ai',
      timestamp: '2026-03-20T09:03:00Z',
      content: {
        title: 'Approve vendor payment',
        approval_mode: 'human_approval_required',
        status: 'pending',
        amount: 1299,
        currency: 'USD',
        vendor: 'Conference Travel Pty Ltd',
        reason: 'Invoice amount matches the approved travel request and the due date is Friday.',
      },
      summary: 'Payment is ready to send but requires a human approval.',
      attachments: [],
    },
  ],
};
