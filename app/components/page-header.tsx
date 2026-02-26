import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: string;
  className?: string;
}

export function PageHeader({ title, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-end mb-8", className)}>
      <span className="text-xs uppercase tracking-[0.14em] text-text-secondary">
        {title}
      </span>
    </div>
  );
}
