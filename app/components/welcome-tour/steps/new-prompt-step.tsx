export default function NewPromptStep() {
  return (
    <div className="w-full space-y-3">
      <textarea
        readOnly
        className="w-full resize-none rounded-sm border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-muted)] focus:outline-none"
        rows={3}
        defaultValue="What are the best tools for remote software teams?"
      />
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-muted)]">Schedule:</span>
        {['Daily', 'Weekly', 'Monthly'].map((s) => (
          <span
            key={s}
            className={`rounded-sm border px-2 py-0.5 text-xs ${
              s === 'Weekly'
                ? 'border-[var(--brand-amber)]/50 bg-[var(--brand-amber)]/10 text-[var(--brand-amber)]'
                : 'border-[var(--border-subtle)] text-[var(--text-muted)]'
            }`}
          >
            {s}
          </span>
        ))}
      </div>
    </div>
  );
}
