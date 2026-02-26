import { cn } from '@/lib/utils';
import { AlertCircle, CheckCircle, Info, X } from 'lucide-react';
import { useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastProps {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  onClose: (id: string) => void;
  duration?: number;
  persistent?: boolean;
}

const icons = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
};

const styles = {
  success: 'border-green-500/50 bg-green-950/30 text-green-200',
  error: 'border-red-500/50 bg-red-950/30 text-red-200',
  info: 'border-blue-500/50 bg-blue-950/30 text-blue-200',
};

const iconColors = {
  success: 'text-green-500',
  error: 'text-red-500',
  info: 'text-blue-500',
};

export function Toast({
  id,
  type,
  title,
  message,
  onClose,
  duration = 5000,
  persistent = false,
}: ToastProps) {
  const Icon = icons[type];

  useEffect(() => {
    if (persistent) return;

    const timer = setTimeout(() => {
      onClose(id);
    }, duration);

    return () => clearTimeout(timer);
  }, [id, duration, persistent, onClose]);

  return (
    <div
      className={cn(
        'flex items-start gap-4 p-4 rounded-md border shadow-lg backdrop-blur-sm min-w-[320px] max-w-[420px] animate-in slide-in-from-bottom-5 fade-in duration-300',
        styles[type]
      )}
      role="alert"
    >
      <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', iconColors[type])} />
      <div className="flex-1 gap-1">
        {title && <h3 className="font-semibold text-sm leading-none mb-1">{title}</h3>}
        <p className="text-sm opacity-90 leading-relaxed">{message}</p>
      </div>
      <button
        onClick={() => onClose(id)}
        className="shrink-0 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <X className="w-4 h-4" />
        <span className="sr-only">Close</span>
      </button>
    </div>
  );
}
