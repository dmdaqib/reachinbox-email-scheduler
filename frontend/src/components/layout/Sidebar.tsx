import React from 'react';

type SidebarProps = {
  activeTab: 'all' | 'scheduled' | 'sent' | 'senders';
  setActiveTab: (tab: 'all' | 'scheduled' | 'sent' | 'senders') => void;
  scheduledCount: number;
  sentCount: number;
  sendersCount: number;
  onOpenCompose: () => void;
};

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  scheduledCount,
  sentCount,
  sendersCount,
  onOpenCompose,
}) => {
  return (
    <aside className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-6 bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
      {/* Brand & Compose Button */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-black text-lg shadow-md shadow-brand-600/25">
            R
          </div>
          <div>
            <div className="font-extrabold text-slate-900 tracking-tight leading-none text-base">ReachInbox</div>
            <div className="text-[10px] font-bold text-brand-700 mt-1 uppercase tracking-wider">Email Scheduler</div>
          </div>
        </div>

        <button
          onClick={onOpenCompose}
          className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 active:scale-[0.98] text-white font-bold py-3 px-4 rounded-2xl shadow-md shadow-brand-600/20 transition-all text-sm cursor-pointer"
        >
          <span className="text-lg font-light leading-none">+</span>
          <span>Compose New</span>
        </button>
      </div>

      <div className="h-px bg-slate-100 my-0.5" />

      {/* Navigation Links */}
      <nav className="flex flex-col gap-1.5">
        <div className="px-3 text-[10px] font-extrabold text-slate-400 uppercase tracking-widest mb-1">
          Navigation
        </div>

        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-medium text-xs transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-brand-50/80 text-brand-800 font-bold border border-brand-200/60 shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">📊</span>
            <span>Dashboard Overview</span>
          </div>
        </button>

        <button
          onClick={() => setActiveTab('scheduled')}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-medium text-xs transition-all cursor-pointer ${
            activeTab === 'scheduled'
              ? 'bg-brand-50/80 text-brand-800 font-bold border border-brand-200/60 shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">⏳</span>
            <span>Scheduled Emails</span>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'scheduled' ? 'bg-brand-200/80 text-brand-900' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {scheduledCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sent')}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-medium text-xs transition-all cursor-pointer ${
            activeTab === 'sent'
              ? 'bg-brand-50/80 text-brand-800 font-bold border border-brand-200/60 shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">✉️</span>
            <span>Sent & Delivered</span>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'sent' ? 'bg-brand-200/80 text-brand-900' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {sentCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('senders')}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-2xl font-medium text-xs transition-all cursor-pointer ${
            activeTab === 'senders'
              ? 'bg-brand-50/80 text-brand-800 font-bold border border-brand-200/60 shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">👤</span>
            <span>Sender Profiles</span>
          </div>
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'senders' ? 'bg-brand-200/80 text-brand-900' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {sendersCount}
          </span>
        </button>
      </nav>

      {/* System info badge */}
      <div className="mt-auto rounded-2xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs text-slate-600 space-y-1">
        <div className="flex items-center gap-1.5 font-bold text-slate-800">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>BullMQ Delay Queue</span>
        </div>
        <div className="text-[11px] text-slate-500">Atomic Redis rate limiter active</div>
      </div>
    </aside>
  );
};
