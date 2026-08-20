import React from 'react';
import type { User } from '../../types';

type HeaderProps = {
  user: User | null;
  onLogout: () => void;
};

export const Header: React.FC<HeaderProps> = ({ user, onLogout }) => {
  return (
    <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#e2e8e2] pb-5 mb-6">
      <div>
        <div className="text-xs uppercase font-bold tracking-[0.2em] text-slate-400">ReachInbox Email Scheduler</div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight mt-0.5">Campaign Management</h1>
      </div>

      <div className="flex items-center gap-4 self-end sm:self-auto">
        {user && (
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 shadow-xs">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.name} className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs">
                {user.name?.[0]?.toUpperCase() ?? 'U'}
              </div>
            )}
            <div className="text-left leading-none pr-1">
              <div className="text-xs font-semibold text-slate-800">{user.name}</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{user.email}</div>
            </div>
          </div>
        )}

        <button
          onClick={onLogout}
          className="rounded-full border border-slate-200 bg-white hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 px-4 py-2 text-xs font-semibold text-slate-600 transition-all shadow-xs"
        >
          Logout
        </button>
      </div>
    </header>
  );
};
