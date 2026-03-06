import { Line, LineChart, ResponsiveContainer } from 'recharts';

const data = [
  { v: 45 },
  { v: 52 },
  { v: 48 },
  { v: 61 },
  { v: 58 },
  { v: 65 },
];

export default function DashboardStep() {
  return (
    <div className="w-full space-y-3">
      <div className="flex gap-2">
        {[
          { label: 'Avg Rank', value: '2.4' },
          { label: 'Share of Voice', value: '68%' },
          { label: 'Runs', value: '12' },
        ].map((chip) => (
          <div
            key={chip.label}
            className="flex-1 rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 text-center"
          >
            <div className="text-xs text-[var(--text-muted)]">{chip.label}</div>
            <div className="text-sm font-semibold text-[var(--text-primary)]">{chip.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
        <ResponsiveContainer width="100%" height={112}>
          <LineChart data={data}>
            <Line
              type="monotone"
              dataKey="v"
              stroke="var(--brand-amber)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
