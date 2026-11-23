import { type ThreadData } from '../schema';

type OutcomeRecord = {
  outcome_id: string;
  decision_message_id: string;
  decision_title: string;
  decision_made_at: string;
  outcome_recorded_at: string;
  outcome: string;
  outcome_score: number;
  reflection?: string;
  category?: string;
  decision_time_ms?: number;
};

type CategoryStat = { name: string; count: number; avg_score: number };

type OutcomeReview = {
  review_id: string;
  period_start: string;
  period_end: string;
  total_decisions: number;
  positive_count: number;
  negative_count: number;
  neutral_count: number;
  mixed_count: number;
  avg_outcome_score: number;
  avg_decision_time_ms?: number;
  categories: CategoryStat[];
  insights: string[];
};

const OUTCOME_EMOJI: Record<string, string> = {
  positive: '✅',
  neutral:  '➖',
  negative: '❌',
  mixed:    '🔄',
};

const OUTCOME_COLOR: Record<string, string> = {
  positive: 'text-green-400',
  neutral:  'text-zinc-400',
  negative: 'text-red-400',
  mixed:    'text-yellow-400',
};

const OUTCOME_BG: Record<string, string> = {
  positive: 'bg-green-900',
  neutral:  'bg-zinc-800',
  negative: 'bg-red-900',
  mixed:    'bg-yellow-900',
};

function extractRecords(thread: ThreadData): { records: OutcomeRecord[]; review?: OutcomeReview } {
  const records: OutcomeRecord[] = [];
  let latestReview: OutcomeReview | undefined;
  let latestReviewTs = '';

  for (const msg of thread.messages) {
    if (msg.type !== 'decision_outcome') continue;
    if (msg.content['subtype'] === 'record' || (msg.content as { outcome?: string }).outcome) {
      const c = msg.content as Partial<OutcomeRecord>;
      if (c.outcome_id) {
        records.push({
          outcome_id: c.outcome_id,
          decision_message_id: c.decision_message_id ?? '',
          decision_title: c.decision_title ?? 'Decision',
          decision_made_at: c.decision_made_at ?? msg.timestamp,
          outcome_recorded_at: c.outcome_recorded_at ?? msg.timestamp,
          outcome: c.outcome ?? 'neutral',
          outcome_score: c.outcome_score ?? 0,
          reflection: c.reflection,
          category: c.category,
          decision_time_ms: c.decision_time_ms,
        });
      }
    }
    if (msg.content['total_decisions'] !== undefined && msg.timestamp > latestReviewTs) {
      latestReviewTs = msg.timestamp;
      latestReview = msg.content as unknown as OutcomeReview;
    }
  }

  records.sort((a, b) => b.outcome_recorded_at.localeCompare(a.outcome_recorded_at));
  return { records, review: latestReview };
}

function ScoreDot({ score }: { score: number }) {
  const pct = ((score + 1) / 2) * 100;
  const color = score > 0.3 ? '#22c55e' : score < -0.3 ? '#ef4444' : '#71717a';
  return (
    <div
      className="w-2 h-2 rounded-full flex-shrink-0"
      style={{ backgroundColor: color }}
      title={`Score: ${score.toFixed(2)}`}
    />
  );
}

function ReviewSummary({ review }: { review: OutcomeReview }) {
  const positiveRate = review.total_decisions > 0
    ? Math.round((review.positive_count / review.total_decisions) * 100)
    : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Period Review</h3>
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: 'Total', value: review.total_decisions, color: 'text-zinc-200' },
          { label: 'Positive', value: review.positive_count, color: 'text-green-400' },
          { label: 'Negative', value: review.negative_count, color: 'text-red-400' },
          { label: '% Positive', value: `${positiveRate}%`, color: 'text-indigo-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-800 rounded-lg p-2">
            <div className={`text-lg font-bold ${color}`}>{value}</div>
            <div className="text-xs text-zinc-500">{label}</div>
          </div>
        ))}
      </div>
      {review.insights.length > 0 && (
        <ul className="space-y-1">
          {review.insights.map((ins, i) => (
            <li key={i} className="text-xs text-zinc-400 flex gap-1.5">
              <span className="text-indigo-500 flex-shrink-0">›</span>
              {ins}
            </li>
          ))}
        </ul>
      )}
      {review.categories.length > 0 && (
        <div>
          <h4 className="text-xs text-zinc-600 mb-1.5">By category</h4>
          <div className="flex flex-wrap gap-2">
            {review.categories.map((cat) => (
              <div key={cat.name} className="bg-zinc-800 rounded px-2 py-1 text-xs flex items-center gap-1.5">
                <span className="text-zinc-300">{cat.name}</span>
                <span className="text-zinc-600">{cat.count}</span>
                <ScoreDot score={cat.avg_score} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type DiaryEntryProps = { record: OutcomeRecord };

function DiaryEntry({ record }: DiaryEntryProps) {
  const emoji = OUTCOME_EMOJI[record.outcome] ?? '➖';
  const color = OUTCOME_COLOR[record.outcome] ?? 'text-zinc-400';
  const bg    = OUTCOME_BG[record.outcome] ?? 'bg-zinc-800';

  return (
    <div className="flex gap-3 items-start py-3 border-b border-zinc-800 last:border-0">
      <div className={`w-7 h-7 rounded-full ${bg} flex items-center justify-center flex-shrink-0 text-sm`}>
        {emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-zinc-200 truncate">{record.decision_title}</span>
          <span className={`text-xs font-semibold capitalize ${color}`}>{record.outcome}</span>
        </div>
        {record.reflection && (
          <p className="text-xs text-zinc-500 mt-0.5 italic line-clamp-2">"{record.reflection}"</p>
        )}
        <div className="flex gap-3 mt-1 text-xs text-zinc-600">
          <span>{record.outcome_recorded_at.slice(0, 10)}</span>
          {record.category && <span className="bg-zinc-800 rounded px-1">{record.category}</span>}
          {record.decision_time_ms !== undefined && (
            <span>{(record.decision_time_ms / 1000).toFixed(0)}s to decide</span>
          )}
        </div>
      </div>
      <ScoreDot score={record.outcome_score} />
    </div>
  );
}

type DecisionOutcomeDiaryProps = { thread: ThreadData };

export default function DecisionOutcomeDiary({ thread }: DecisionOutcomeDiaryProps) {
  const { records, review } = extractRecords(thread);

  if (records.length === 0 && !review) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-sm">
        No decision outcomes recorded yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {review && <ReviewSummary review={review} />}
      {records.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl px-4">
          {records.slice(0, 20).map((r) => (
            <DiaryEntry key={r.outcome_id} record={r} />
          ))}
          {records.length > 20 && (
            <div className="py-3 text-xs text-zinc-600 text-center">
              + {records.length - 20} older entries
            </div>
          )}
        </div>
      )}
    </div>
  );
}
