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
    <aside className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-6 bg-white border border-[#e5ebe5] rounded-3xl p-5 shadow-sm">
      {/* Brand & Compose Button */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 px-2">
          <div className="h-9 w-9 rounded-xl bg-brand-600 flex items-center justify-center text-white font-black text-lg shadow-md shadow-brand-600/20">
            R
          </div>
          <div>
            <div className="font-bold text-slate-800 tracking-tight leading-none text-base">ReachInbox</div>
            <div className="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-wider">Scheduler</div>
          </div>
        </div>

        <button
          onClick={onOpenCompose}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 active:scale-[0.98] text-white font-semibold py-3 px-4 rounded-2xl shadow-sm hover:shadow-md shadow-brand-600/20 transition-all text-sm"
        >
          <span className="text-lg font-light">+</span> Compose New
        </button>
      </div>

      <div className="h-px bg-slate-100 my-1" />

      {/* Navigation Links */}
      <nav className="flex flex-col gap-1.5">
        <div className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">
          Navigation
        </div>

        <button
          onClick={() => setActiveTab('all')}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'all'
              ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs'
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
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'scheduled'
              ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">⏳</span>
            <span>Scheduled Emails</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'scheduled' ? 'bg-brand-200 text-brand-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {scheduledCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('sent')}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'sent'
              ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">✉️</span>
            <span>Sent & Delivered</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'sent' ? 'bg-brand-200 text-brand-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {sentCount}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('senders')}
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all ${
            activeTab === 'senders'
              ? 'bg-brand-50 text-brand-700 font-semibold shadow-xs'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">👤</span>
            <span>Senders</span>
          </div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === 'senders' ? 'bg-brand-200 text-brand-800' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {sendersCount}
          </span>
        </button>
      </nav>

      {/* System info badge */}
      <div className="mt-auto rounded-2xl bg-[#f4f8f4] border border-[#e1ebe1] p-3.5 text-xs text-slate-600 space-y-1">
        <div className="font-semibold text-slate-800">BullMQ Delay Queue</div>
        <div className="text-[11px] text-slate-500">Atomic Lua rate limiter active</div>
      </div>
    </aside>
  );
};
