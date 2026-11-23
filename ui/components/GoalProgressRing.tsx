import { type ThreadData } from '../schema';

type GoalMilestone = {
  milestone_id: string;
  title: string;
  due_date?: string;
  completed: boolean;
  completed_at?: string;
};

type GoalRecord = {
  goal_id: string;
  title: string;
  description?: string;
  progress_pct: number;
  previous_pct?: number;
  deadline?: string;
  milestones: GoalMilestone[];
  category?: string;
  updated_at: string;
};

function extractGoals(thread: ThreadData): GoalRecord[] {
  const latest = new Map<string, { ts: string; goal: GoalRecord }>();
  for (const msg of thread.messages) {
    if (msg.type !== 'goal_progress') continue;
    const content = msg.content as Partial<GoalRecord>;
    if (!content.goal_id) continue;
    const existing = latest.get(content.goal_id);
    if (!existing || msg.timestamp > existing.ts) {
      latest.set(content.goal_id, {
        ts: msg.timestamp,
        goal: {
          goal_id: content.goal_id,
          title: content.title ?? 'Untitled Goal',
          description: content.description,
          progress_pct: content.progress_pct ?? 0,
          previous_pct: content.previous_pct,
          deadline: content.deadline,
          milestones: content.milestones ?? [],
          category: content.category,
          updated_at: content.updated_at ?? msg.timestamp,
        },
      });
    }
  }
  return [...latest.values()].map((v) => v.goal);
}

type RingProps = { pct: number; size?: number; stroke?: number };

function Ring({ pct, size = 64, stroke = 7 }: RingProps) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * circumference;
  const isComplete = pct >= 100;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#27272a"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={isComplete ? '#22c55e' : '#6366f1'}
        strokeWidth={stroke}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

type GoalCardProps = { goal: GoalRecord };

function GoalCard({ goal }: GoalCardProps) {
  const completedMs = goal.milestones.filter((m) => m.completed).length;
  const totalMs = goal.milestones.length;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4 items-start">
      <div className="relative flex-shrink-0 flex items-center justify-center" style={{ width: 64, height: 64 }}>
        <Ring pct={goal.progress_pct} />
        <span className="absolute text-xs font-semibold text-zinc-200">
          {Math.round(goal.progress_pct)}%
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-zinc-100 truncate">{goal.title}</span>
          {goal.progress_pct >= 100 && (
            <span className="text-xs bg-green-900 text-green-300 rounded px-1.5 py-0.5">Complete</span>
          )}
          {goal.category && (
            <span className="text-xs bg-zinc-800 text-zinc-400 rounded px-1.5 py-0.5">{goal.category}</span>
          )}
        </div>
        {goal.description && (
          <p className="text-xs text-zinc-500 mb-2 line-clamp-2">{goal.description}</p>
        )}
        {totalMs > 0 && (
          <div className="space-y-1">
            {goal.milestones.slice(0, 3).map((m) => (
              <div key={m.milestone_id} className="flex items-center gap-2 text-xs">
                <span
                  className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 flex items-center justify-center ${
                    m.completed
                      ? 'border-green-500 bg-green-900 text-green-300'
                      : 'border-zinc-600'
                  }`}
                >
                  {m.completed && '✓'}
                </span>
                <span className={m.completed ? 'text-zinc-500 line-through' : 'text-zinc-300'}>
                  {m.title}
                </span>
              </div>
            ))}
            {totalMs > 3 && (
              <span className="text-xs text-zinc-600">+{totalMs - 3} more milestones</span>
            )}
          </div>
        )}
        <div className="flex gap-3 mt-2 text-xs text-zinc-600">
          {goal.deadline && <span>Due {goal.deadline.slice(0, 10)}</span>}
          {totalMs > 0 && (
            <span>{completedMs}/{totalMs} milestones</span>
          )}
        </div>
      </div>
    </div>
  );
}

type GoalProgressRingProps = { thread: ThreadData };

export default function GoalProgressRing({ thread }: GoalProgressRingProps) {
  const goals = extractGoals(thread);

  if (goals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-zinc-600 text-sm">
        No goals tracked yet.
      </div>
    );
  }

  const active = goals.filter((g) => g.progress_pct < 100);
  const completed = goals.filter((g) => g.progress_pct >= 100);

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Active</h3>
          {active.map((g) => (
            <GoalCard key={g.goal_id} goal={g} />
          ))}
        </>
      )}
      {completed.length > 0 && (
        <>
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mt-4">Completed</h3>
          {completed.map((g) => (
            <GoalCard key={g.goal_id} goal={g} />
          ))}
        </>
      )}
    </div>
  );
}
