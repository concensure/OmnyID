import { type ThreadData } from '../schema';

// ── AFP shape ─────────────────────────────────────────────────────────────────

type BentoSlot = {
  slot_id: string;
  col_span: number;   // 1–3
  row_span: number;   // 1–2
  variant: 'metric' | 'list' | 'text' | 'badge' | 'sparkline' | 'progress' | 'image';
  label?: string;
  value?: string;
  sub_label?: string;
  trend?: 'up' | 'down' | 'flat';
  color?: 'green' | 'red' | 'yellow' | 'indigo' | 'zinc';
  items?: unknown[];
};

type BentoCardContent = {
  card_id: string;
  title: string;
  subtitle?: string;
  slots: BentoSlot[];
  composed_at: string;
};

// ── Colour maps ───────────────────────────────────────────────────────────────

const ACCENT_TEXT: Record<string, string> = {
  green:  'text-green-400',
  red:    'text-red-400',
  yellow: 'text-yellow-400',
  indigo: 'text-indigo-400',
  zinc:   'text-zinc-300',
};

const ACCENT_BG: Record<string, string> = {
  green:  'bg-green-900/60',
  red:    'bg-red-900/60',
  yellow: 'bg-yellow-900/60',
  indigo: 'bg-indigo-900/60',
  zinc:   'bg-zinc-800',
};

const ACCENT_BAR: Record<string, string> = {
  green:  'bg-green-500',
  red:    'bg-red-500',
  yellow: 'bg-yellow-400',
  indigo: 'bg-indigo-500',
  zinc:   'bg-zinc-500',
};

const ACCENT_STROKE: Record<string, string> = {
  green:  '#22c55e',
  red:    '#ef4444',
  yellow: '#eab308',
  indigo: '#6366f1',
  zinc:   '#71717a',
};

const TREND_ICON: Record<string, string> = { up: '↑', down: '↓', flat: '→' };
const TREND_COLOR: Record<string, string> = { up: 'text-green-400', down: 'text-red-400', flat: 'text-zinc-500' };

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ points, color }: { points: number[]; color: string }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 36;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((v) => h - ((v - min) / range) * (h - 4) - 2);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const stroke = ACCENT_STROKE[color] ?? ACCENT_STROKE.indigo;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-9" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Slot renderers ────────────────────────────────────────────────────────────

function MetricCell({ slot }: { slot: BentoSlot }) {
  const color = slot.color ?? 'indigo';
  return (
    <div className="flex flex-col justify-between h-full gap-1">
      {slot.label && <span className="text-xs text-zinc-500 font-medium">{slot.label}</span>}
      <div className="flex items-end gap-2">
        <span className={`text-3xl font-bold leading-none ${ACCENT_TEXT[color]}`}>{slot.value ?? '—'}</span>
        {slot.trend && (
          <span className={`text-sm font-semibold pb-0.5 ${TREND_COLOR[slot.trend]}`}>
            {TREND_ICON[slot.trend]}
          </span>
        )}
      </div>
      {slot.sub_label && <span className="text-xs text-zinc-600">{slot.sub_label}</span>}
    </div>
  );
}

function ListCell({ slot }: { slot: BentoSlot }) {
  const items = (slot.items ?? []) as string[];
  return (
    <div className="flex flex-col gap-1.5 h-full">
      {slot.label && <span className="text-xs text-zinc-500 font-medium">{slot.label}</span>}
      <ul className="space-y-1 flex-1">
        {items.slice(0, 6).map((item, i) => (
          <li key={i} className="flex gap-2 text-xs text-zinc-300">
            <span className="text-zinc-600 flex-shrink-0">›</span>
            <span className="line-clamp-1">{String(item)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TextCell({ slot }: { slot: BentoSlot }) {
  return (
    <div className="flex flex-col gap-1.5 h-full">
      {slot.label && <span className="text-xs text-zinc-500 font-medium">{slot.label}</span>}
      <p className="text-xs text-zinc-300 leading-relaxed line-clamp-4 flex-1">{slot.value ?? ''}</p>
    </div>
  );
}

function BadgeCell({ slot }: { slot: BentoSlot }) {
  const color = slot.color ?? 'zinc';
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      {slot.label && <span className="text-xs text-zinc-500 font-medium">{slot.label}</span>}
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${ACCENT_BG[color]} ${ACCENT_TEXT[color]}`}>
        {slot.value ?? ''}
      </span>
    </div>
  );
}

function SparklineCell({ slot }: { slot: BentoSlot }) {
  const points = (slot.items ?? []).map(Number).filter((n) => !isNaN(n));
  const color = slot.color ?? 'indigo';
  const last = points[points.length - 1];
  return (
    <div className="flex flex-col gap-1 h-full">
      {slot.label && <span className="text-xs text-zinc-500 font-medium">{slot.label}</span>}
      <div className="flex-1 min-h-0">
        <Sparkline points={points} color={color} />
      </div>
      <div className="flex items-center justify-between">
        {last !== undefined && (
          <span className={`text-sm font-semibold ${ACCENT_TEXT[color]}`}>{last}</span>
        )}
        {slot.trend && (
          <span className={`text-xs ${TREND_COLOR[slot.trend]}`}>
            {TREND_ICON[slot.trend]} {slot.sub_label}
          </span>
        )}
      </div>
    </div>
  );
}

function ProgressCell({ slot }: { slot: BentoSlot }) {
  const pct = Math.min(100, Math.max(0, Number(slot.value ?? 0)));
  const color = slot.color ?? 'indigo';
  return (
    <div className="flex flex-col justify-center gap-2 h-full">
      {slot.label && (
        <div className="flex justify-between items-center">
          <span className="text-xs text-zinc-500 font-medium">{slot.label}</span>
          <span className={`text-xs font-semibold ${ACCENT_TEXT[color]}`}>{pct}%</span>
        </div>
      )}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${ACCENT_BAR[color]}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {slot.sub_label && <span className="text-xs text-zinc-600">{slot.sub_label}</span>}
    </div>
  );
}

function SlotCell({ slot }: { slot: BentoSlot }) {
  const colClass = ['', 'col-span-1', 'col-span-2', 'col-span-3'][Math.min(slot.col_span ?? 1, 3)];
  const rowClass = slot.row_span === 2 ? 'row-span-2' : '';
  const color = slot.color ?? 'zinc';

  let inner: React.ReactNode;
  switch (slot.variant) {
    case 'metric':    inner = <MetricCell slot={slot} />;    break;
    case 'list':      inner = <ListCell slot={slot} />;      break;
    case 'text':      inner = <TextCell slot={slot} />;      break;
    case 'badge':     inner = <BadgeCell slot={slot} />;     break;
    case 'sparkline': inner = <SparklineCell slot={slot} />; break;
    case 'progress':  inner = <ProgressCell slot={slot} />;  break;
    default:          inner = <span className="text-xs text-zinc-600">{slot.variant}</span>;
  }

  return (
    <div
      className={`${colClass} ${rowClass} rounded-xl border border-zinc-800 bg-zinc-900 p-4 min-h-[5rem] flex flex-col`}
      style={{ borderTopColor: slot.color ? ACCENT_STROKE[color] : undefined, borderTopWidth: slot.color ? 2 : undefined }}
    >
      {inner}
    </div>
  );
}

// ── Thread extractor ──────────────────────────────────────────────────────────

function extractBentoCards(thread: ThreadData): BentoCardContent[] {
  const cards: BentoCardContent[] = [];
  for (const msg of thread.messages) {
    if (msg.type !== 'bento_card') continue;
    const c = msg.content as Partial<BentoCardContent>;
    if (c.card_id && Array.isArray(c.slots)) {
      cards.push(c as BentoCardContent);
    }
  }
  cards.sort((a, b) => a.composed_at.localeCompare(b.composed_at));
  return cards;
}

// ── Public component ──────────────────────────────────────────────────────────

type BentoCardProps = { thread: ThreadData };

export default function BentoCard({ thread }: BentoCardProps) {
  const cards = extractBentoCards(thread);

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-sm">
        No bento cards composed yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {cards.map((card) => (
        <div key={card.card_id} className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">{card.title}</h3>
            {card.subtitle && <p className="text-xs text-zinc-500 mt-0.5">{card.subtitle}</p>}
          </div>
          {/* 3-column CSS grid; slots declare their own span */}
          <div className="grid grid-cols-3 gap-3">
            {card.slots.map((slot) => (
              <SlotCell key={slot.slot_id} slot={slot} />
            ))}
          </div>
          <div className="text-right text-xs text-zinc-700">
            {card.composed_at.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
      ))}
    </div>
  );
}
