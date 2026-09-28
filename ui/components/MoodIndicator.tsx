import { type ThreadData } from '../schema';

type MoodRecord = {
  mood: string;
  valence: number;
  energy: number;
  context_note?: string;
  session_id?: string;
  recorded_at: string;
  carry_forward_from?: string;
};

const MOOD_EMOJI: Record<string, string> = {
  energised: '⚡',
  focused:   '🎯',
  neutral:   '😐',
  tired:     '😴',
  stressed:  '😤',
  anxious:   '😰',
  happy:     '😊',
};

const MOOD_COLOR: Record<string, { bg: string; text: string; bar: string }> = {
  energised: { bg: 'bg-yellow-900', text: 'text-yellow-300', bar: 'bg-yellow-400' },
  focused:   { bg: 'bg-indigo-900', text: 'text-indigo-300', bar: 'bg-indigo-400' },
  neutral:   { bg: 'bg-zinc-800',   text: 'text-zinc-400',   bar: 'bg-zinc-500'   },
  tired:     { bg: 'bg-slate-900',  text: 'text-slate-400',  bar: 'bg-slate-500'  },
  stressed:  { bg: 'bg-red-900',    text: 'text-red-300',    bar: 'bg-red-500'    },
  anxious:   { bg: 'bg-orange-900', text: 'text-orange-300', bar: 'bg-orange-500' },
  happy:     { bg: 'bg-green-900',  text: 'text-green-300',  bar: 'bg-green-400'  },
};

function extractMoodHistory(thread: ThreadData): MoodRecord[] {
  const records: MoodRecord[] = [];
  for (const msg of thread.messages) {
    if (msg.type !== 'mood_record') continue;
    const c = msg.content as Partial<MoodRecord>;
    if (!c.mood || c.valence === undefined) continue;
    records.push({
      mood: c.mood,
      valence: c.valence,
      energy: c.energy ?? 0.5,
      context_note: c.context_note,
      session_id: c.session_id,
      recorded_at: c.recorded_at ?? msg.timestamp,
      carry_forward_from: c.carry_forward_from,
    });
  }
  records.sort((a, b) => a.recorded_at.localeCompare(b.recorded_at));
  return records;
}

function computeTrend(records: MoodRecord[]): 'improving' | 'stable' | 'declining' | 'insufficient' {
  if (records.length < 2) return 'insufficient';
  const mid = Math.floor(records.length / 2);
  const firstAvg = records.slice(0, mid).reduce((s, r) => s + r.valence, 0) / mid;
  const secondAvg = records.slice(mid).reduce((s, r) => s + r.valence, 0) / (records.length - mid);
  const delta = secondAvg - firstAvg;
  if (delta > 0.15) return 'improving';
  if (delta < -0.15) return 'declining';
  return 'stable';
}

const TREND_LABEL: Record<string, string> = {
  improving: '↗ Improving',
  stable:    '→ Stable',
  declining: '↘ Declining',
  insufficient: '— Not enough data',
};

const TREND_COLOR: Record<string, string> = {
  improving: 'text-green-400',
  stable:    'text-zinc-400',
  declining: 'text-red-400',
  insufficient: 'text-zinc-600',
};

type MoodBarProps = { value: number; label: string; color: string };

function MoodBar({ value, label, color }: MoodBarProps) {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-12 text-zinc-500 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-zinc-500">{value >= 0 ? '+' : ''}{value.toFixed(2)}</span>
    </div>
  );
}

type MoodIndicatorProps = { thread: ThreadData };

export default function MoodIndicator({ thread }: MoodIndicatorProps) {
  const history = extractMoodHistory(thread);

  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-sm">
        No mood check-ins yet.
      </div>
    );
  }

  const latest = history[history.length - 1];
  const trend = computeTrend(history);
  const colors = MOOD_COLOR[latest.mood] ?? MOOD_COLOR.neutral;
  const emoji = MOOD_EMOJI[latest.mood] ?? '😐';

  return (
    <div className="space-y-4">
      {/* Current mood card */}
      <div className={`${colors.bg} rounded-xl p-4 flex items-center gap-4`}>
        <span className="text-4xl">{emoji}</span>
        <div className="flex-1">
          <div className={`text-lg font-semibold capitalize ${colors.text}`}>{latest.mood}</div>
          {latest.carry_forward_from && (
            <div className="text-xs text-zinc-500">Carried forward from last session</div>
          )}
          {latest.context_note && (
            <p className="text-xs text-zinc-400 mt-1 italic">"{latest.context_note}"</p>
          )}
          <div className="text-xs text-zinc-600 mt-1">
            {latest.recorded_at.slice(0, 16).replace('T', ' ')}
          </div>
        </div>
        <div className={`text-sm font-medium ${TREND_COLOR[trend]}`}>
          {TREND_LABEL[trend]}
        </div>
      </div>

      {/* Valence / Energy bars */}
      <div className="space-y-2 px-1">
        <MoodBar value={latest.valence} label="Valence" color={colors.bar} />
        <MoodBar value={latest.energy * 2 - 1} label="Energy" color={colors.bar} />
      </div>

      {/* Mini history */}
      {history.length > 1 && (
        <div>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
            Recent check-ins
          </h3>
          <div className="flex gap-2 flex-wrap">
            {history.slice(-8).reverse().slice(1).map((r, i) => {
              const c = MOOD_COLOR[r.mood] ?? MOOD_COLOR.neutral;
              const e = MOOD_EMOJI[r.mood] ?? '😐';
              return (
                <div
                  key={i}
                  className={`${c.bg} rounded-lg px-2 py-1 flex items-center gap-1 text-xs`}
                  title={`${r.mood} (${r.recorded_at.slice(0, 10)})`}
                >
                  <span>{e}</span>
                  <span className={c.text}>{r.mood}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
