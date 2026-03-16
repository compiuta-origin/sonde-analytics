import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { ReactNode } from 'react';

type ModalLevel = 'info' | 'warning' | 'error';

const LEVEL_CONFIG: Record<ModalLevel, { Icon: typeof Info }> = {
  info: { Icon: Info },
  warning: { Icon: AlertTriangle },
  error: { Icon: AlertCircle },
};

interface ModalProps {
  title: string;
  level?: ModalLevel;
  children: ReactNode;
  actions: ReactNode;
}

export function Modal({ title, level = 'info', children, actions }: ModalProps) {
  const { Icon } = LEVEL_CONFIG[level];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-sm border border-border-subtle bg-canvas p-6 shadow-xl"
      >
        <div className="flex items-center gap-2 mb-3">
          <Icon size={18} className="shrink-0 text-text-primary" />
          <h2 className="text-base font-bold text-text-primary">{title}</h2>
        </div>
        <div className="text-sm text-text-secondary space-y-2">{children}</div>
        <div className="flex justify-end gap-3 mt-5">{actions}</div>
      </div>
    </div>
  );
}
