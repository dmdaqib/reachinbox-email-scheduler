import React from 'react';
import type { User } from '../../types';

type HeaderProps = {
  user: User | null;
  onLogout: () => void;
};

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5 mb-6">
      <div>
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] uppercase font-bold tracking-[0.2em] text-slate-400">
            ReachInbox Scheduler
          </span>
        </div>
        <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
          Campaign Management
        </h1>
      </div>

      <div className="flex items-center gap-3 self-end sm:self-auto">
        {user && (
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/80 backdrop-blur-xs px-3.5 py-2 shadow-xs hover:border-slate-300 transition-all">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-xl object-cover border border-slate-100" />
            ) : (
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white font-black flex items-center justify-center text-xs shadow-xs">
                {user.name?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
            <div className="text-left leading-none pr-1">
              <div className="text-xs font-bold text-slate-800">{user.name}</div>
              <div className="text-[11px] text-slate-500 mt-1 font-mono">{user.email}</div>
            </div>
          </div>
        )}

        <button
          onClick={onLogout}
          className="rounded-2xl border border-slate-200/90 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200/80 px-4 py-2 text-xs font-bold text-slate-600 transition-all shadow-xs active:scale-95 cursor-pointer"
        >
          Logout
        </button>
      </div>
    </header>
  );
};
