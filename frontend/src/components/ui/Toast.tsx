import React from 'react';

export type ToastProps = {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
};

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  if (!message) return null;

  const styleConfig = {
    success: 'bg-slate-900 text-white border-emerald-500/30 shadow-emerald-950/10',
    error: 'bg-slate-900 text-white border-rose-500/30 shadow-rose-950/10',
    info: 'bg-slate-900 text-white border-brand-500/30 shadow-brand-950/10',
  }[type];

  const iconMap = {
    success: '✨',
    error: '⚠️',
    info: 'ℹ️',
  }[type];

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md transition-all duration-300 animate-slide-up max-w-md ${styleConfig}`}
    >
      <span className="text-base flex-shrink-0">{iconMap}</span>
      <span className="text-xs font-semibold tracking-wide leading-snug flex-1">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-2 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all text-xs font-bold"
          aria-label="Close notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};
