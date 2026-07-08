'use client';

import React, { useEffect, useState } from 'react';
import { useToastStore, Toast, ToastType } from '@/store/useToastStore';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />,
  error:   <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />,
  info:    <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />,
};

const BG: Record<ToastType, string> = {
  success: 'bg-emerald-50 border-emerald-200',
  error:   'bg-red-50 border-red-200',
  warning: 'bg-amber-50 border-amber-200',
  info:    'bg-blue-50 border-blue-200',
};

const TEXT: Record<ToastType, string> = {
  success: 'text-emerald-900',
  error:   'text-red-900',
  warning: 'text-amber-900',
  info:    'text-blue-900',
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [visible, setVisible] = useState(false);

  // Animate in on mount
  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onRemove, 300);
  };

  return (
    <div
      className={`
        flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg max-w-sm w-full
        transition-all duration-300 ease-in-out
        ${BG[toast.type]}
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}
      `}
      role="alert"
      aria-live="assertive"
    >
      {ICONS[toast.type]}
      <p className={`text-sm font-semibold flex-1 leading-snug ${TEXT[toast.type]}`}>
        {toast.message}
      </p>
      <button
        onClick={handleClose}
        className="text-slate-400 hover:text-slate-600 transition-colors ms-1 flex-shrink-0 mt-0.5"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-5 end-5 z-[9999] flex flex-col gap-2 items-end"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
