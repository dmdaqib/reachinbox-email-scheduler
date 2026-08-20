import React from 'react';

export type ToastProps = {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose?: () => void;
};

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', onClose }) => {
  if (!message) return null;

  const bgStyles =
    type === 'success'
      ? 'bg-emerald-800 text-emerald-100 border-emerald-700'
      : type === 'error'
      ? 'bg-rose-900 text-rose-100 border-rose-800'
      : 'bg-slate-900 text-slate-100 border-slate-700';

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl border px-5 py-3.5 shadow-2xl transition-all duration-300 animate-slide-up ${bgStyles}`}
    >
      <span className="text-sm font-medium">{message}</span>
      {onClose && (
        <button
          onClick={onClose}
          className="ml-2 text-slate-400 hover:text-white transition-colors"
          aria-label="Close notification"
        >
          ✕
        </button>
      )}
    </div>
  );
};
