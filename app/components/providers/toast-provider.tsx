'use client';

import { Toast, ToastType } from '@/components/ui/toast';
import { createContext, useContext, useState, useCallback } from 'react';

interface ToastData {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
  persistent?: boolean;
}

interface ToastContextType {
  showToast: (props: Omit<ToastData, 'id'>) => void;
  success: (message: string, options?: Partial<Omit<ToastData, 'id' | 'type' | 'message'>>) => void;
  error: (message: string, options?: Partial<Omit<ToastData, 'id' | 'type' | 'message'>>) => void;
  info: (message: string, options?: Partial<Omit<ToastData, 'id' | 'type' | 'message'>>) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(({ type, title, message, duration, persistent }: Omit<ToastData, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    
    // Default titles based on type if not provided
    let finalTitle = title;
    if (!finalTitle) {
      if (type === 'success') finalTitle = 'Success';
      if (type === 'error') finalTitle = 'Error';
      if (type === 'info') finalTitle = 'Info';
    }

    setToasts((prev) => [...prev, { id, type, title: finalTitle, message, duration, persistent }]);
  }, []);

  const success = useCallback((message: string, options?: Partial<Omit<ToastData, 'id' | 'type' | 'message'>>) => {
    showToast({ type: 'success', message, ...options });
  }, [showToast]);

  const error = useCallback((message: string, options?: Partial<Omit<ToastData, 'id' | 'type' | 'message'>>) => {
    showToast({ type: 'error', message, ...options });
  }, [showToast]);

  const info = useCallback((message: string, options?: Partial<Omit<ToastData, 'id' | 'type' | 'message'>>) => {
    showToast({ type: 'info', message, ...options });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info }}>
      {children}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-full max-w-md px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex justify-center">
             <Toast
               key={toast.id}
               {...toast}
               onClose={removeToast}
             />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
