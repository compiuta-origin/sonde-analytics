import { Pencil, Play } from 'lucide-react';

export default function PromptListStep() {
  return (
    <div className="w-full rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4">
      <p className="mb-3 truncate text-sm text-[var(--text-primary)]">
        What are the best project management tools for remote teams in 2025?
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
          <span className="rounded-sm border border-[var(--border-subtle)] px-2 py-0.5 text-xs text-[var(--text-muted)]">
            GPT 5.2
          </span>
          <span className="text-xs text-[var(--text-muted)]">Weekly</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-sm border border-[var(--border-subtle)] p-1.5 text-[var(--text-muted)]">
            <Play className="h-3 w-3" />
          </span>
          <span className="rounded-sm border border-[var(--border-subtle)] p-1.5 text-[var(--text-muted)]">
            <Pencil className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
}
