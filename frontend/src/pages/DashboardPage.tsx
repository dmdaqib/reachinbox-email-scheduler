import React, { useEffect, useState } from 'react';
import type { EmailRow, Sender, User } from '../types';
import { Header } from '../components/layout/Header';
import { Sidebar } from '../components/layout/Sidebar';
import { ComposeModal } from '../features/compose/ComposeModal';
import { Toast } from '../components/ui/Toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function DashboardPage() {
  const [user, setUser] = useState<User | null>(null);
  const [senders, setSenders] = useState<Sender[]>([]);
  const [scheduled, setScheduled] = useState<EmailRow[]>([]);
  const [sent, setSent] = useState<EmailRow[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'scheduled' | 'sent' | 'senders'>('all');
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const loadData = async () => {
    try {
      setFetching(true);
      const meRes = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include' });
      if (!meRes.ok) {
        window.location.href = '/login';
        return;
      }
      const me = await meRes.json();
      setUser(me);

      const sendersRes = await fetch(`${API_URL}/api/senders`, { credentials: 'include' });
      const senderList = await sendersRes.json();
      setSenders(Array.isArray(senderList) ? senderList : []);

      const scheduledRes = await fetch(`${API_URL}/api/emails/scheduled?page=1&limit=50`, { credentials: 'include' });
      const scheduledList = await scheduledRes.json();
      setScheduled(Array.isArray(scheduledList) ? scheduledList : []);

      const sentRes = await fetch(`${API_URL}/api/emails/sent`, { credentials: 'include' });
      const sentList = await sentRes.json();
      setSent(Array.isArray(sentList) ? sentList : []);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setToastMessage({ text: 'Error connecting to backend API', type: 'error' });
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto refresh status every 10 seconds
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await fetch(`${API_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/login';
  };

  const handleSchedule = async (payload: {
    subject: string;
    body: string;
    startAt: string;
    delayMs: number;
    hourlyLimit: number;
    senderId?: string;
    recipientsText: string;
    file?: File | null;
  }) => {
    setLoading(true);
    try {
      const form = new FormData();
      form.append('subject', payload.subject);
      form.append('body', payload.body);
      form.append('startAt', new Date(payload.startAt).toISOString());
      form.append('delayMs', String(payload.delayMs));
      form.append('hourlyLimit', String(payload.hourlyLimit));
      if (payload.senderId) form.append('senderId', payload.senderId);

      if (payload.file) {
        form.append('file', payload.file);
      }

      if (payload.recipientsText.trim()) {
        const directList = payload.recipientsText
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        form.append('recipients', JSON.stringify(directList));
      }

      const response = await fetch(`${API_URL}/api/emails/schedule`, {
        method: 'POST',
        credentials: 'include',
        body: form,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to schedule campaign');
      }

      setToastMessage({
        text: `Successfully scheduled ${data.acceptedCount ?? 0} email dispatches!`,
        type: 'success',
      });
      setIsComposeOpen(false);
      await loadData();
    } catch (err) {
      setToastMessage({
        text: err instanceof Error ? err.message : 'Scheduling error',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCancelEmail = async (emailId: string) => {
    const confirmed = window.confirm('Are you sure you want to cancel this scheduled email dispatch?');
    if (!confirmed) return;

    try {
      const response = await fetch(`${API_URL}/api/emails/${emailId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to cancel scheduled email');
      }

      setToastMessage({ text: 'Scheduled email cancelled successfully', type: 'info' });
      await loadData();
    } catch (err) {
      setToastMessage({
        text: err instanceof Error ? err.message : 'Error cancelling email',
        type: 'error',
      });
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f7f3] p-4 sm:p-6 text-slate-800 font-sans">
      <div className="mx-auto max-w-7xl">
        <Header user={user} onLogout={handleLogout} />

        <div className="flex flex-col lg:flex-row gap-6">
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            scheduledCount={scheduled.length}
            sentCount={sent.length}
            sendersCount={senders.length}
            onOpenCompose={() => setIsComposeOpen(true)}
          />

          <main className="flex-1 space-y-6">
            {/* Action Bar */}
            <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-3xl p-5 shadow-xs">
              <div>
                <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
                  {activeTab === 'all' && 'System Overview'}
                  {activeTab === 'scheduled' && 'Scheduled & Pending Emails'}
                  {activeTab === 'sent' && 'Delivered & Failed Log'}
                  {activeTab === 'senders' && 'Configured Sender Profiles'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  BullMQ delay queue active • Multi-worker safe rate limiting
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={loadData}
                  disabled={fetching}
                  className="px-4 py-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all flex items-center gap-2 shadow-xs cursor-pointer active:scale-95"
                >
                  <span className={`text-xs ${fetching ? 'animate-spin' : ''}`}>🔄</span>
                  <span>{fetching ? 'Syncing...' : 'Refresh Data'}</span>
                </button>
              </div>
            </div>

            {/* Content Views */}
            {activeTab === 'all' && (
              <div className="space-y-6">
                {/* Metric Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-xs flex items-center justify-between hover:border-slate-300 transition-all">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Scheduled Queue</div>
                      <div className="text-3xl font-black text-slate-900 mt-1">{scheduled.length}</div>
                      <div className="text-[11px] font-medium text-amber-600 mt-1">Pending dispatch</div>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-xl text-amber-600 shadow-2xs">
                      ⏳
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-xs flex items-center justify-between hover:border-slate-300 transition-all">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Sent & Delivered</div>
                      <div className="text-3xl font-black text-slate-900 mt-1">
                        {sent.filter((s) => s.status === 'SENT').length}
                      </div>
                      <div className="text-[11px] font-medium text-emerald-600 mt-1">SMTP confirmed</div>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-xl text-emerald-600 shadow-2xs">
                      ✅
                    </div>
                  </div>

                  <div className="rounded-3xl bg-white border border-slate-200/80 p-5 shadow-xs flex items-center justify-between hover:border-slate-300 transition-all">
                    <div>
                      <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Sender Profiles</div>
                      <div className="text-3xl font-black text-slate-900 mt-1">{senders.length}</div>
                      <div className="text-[11px] font-medium text-brand-700 mt-1">Active identities</div>
                    </div>
                    <div className="h-12 w-12 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-xl text-brand-600 shadow-2xs">
                      👤
                    </div>
                  </div>
                </div>

                {/* Dashboard Lists Preview */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Scheduled Table Preview */}
                  <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">Scheduled Queue Preview</h3>
                      <button
                        onClick={() => setActiveTab('scheduled')}
                        className="text-xs font-bold text-brand-700 hover:text-brand-900 hover:underline"
                      >
                        View All ({scheduled.length}) ↗
                      </button>
                    </div>

                    {scheduled.length === 0 ? (
                      <div className="text-center py-10 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                        <div className="text-2xl">📭</div>
                        <div className="text-xs font-bold text-slate-700 mt-2">No scheduled emails in queue</div>
                        <p className="text-[11px] text-slate-400 mt-1">Click "+ Compose New" to schedule a campaign</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                        {scheduled.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-slate-200/70 bg-slate-50/50 hover:bg-slate-50/90 p-3.5 transition-all"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-800 text-xs truncate">{item.subject}</span>
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 font-extrabold text-[10px] uppercase tracking-wide">
                                {item.status}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 font-mono">{item.toEmail}</div>
                            <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2 pt-2 border-t border-slate-200/50">
                              <span>Scheduled: {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : '—'}</span>
                              {item.status === 'SCHEDULED' && (
                                <button
                                  onClick={() => handleCancelEmail(item.id)}
                                  className="px-2 py-0.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-extrabold transition-all cursor-pointer"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sent Log Preview */}
                  <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-xs space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="font-extrabold text-slate-900 text-xs uppercase tracking-wider">Sent & Delivered Log Preview</h3>
                      <button
                        onClick={() => setActiveTab('sent')}
                        className="text-xs font-bold text-brand-700 hover:text-brand-900 hover:underline"
                      >
                        View All ({sent.length}) ↗
                      </button>
                    </div>

                    {sent.length === 0 ? (
                      <div className="text-center py-10 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                        <div className="text-2xl">📬</div>
                        <div className="text-xs font-bold text-slate-700 mt-2">No sent emails recorded</div>
                        <p className="text-[11px] text-slate-400 mt-1">Dispatched emails will appear here automatically</p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                        {sent.slice(0, 5).map((item) => (
                          <div
                            key={item.id}
                            className="rounded-2xl border border-slate-200/70 bg-slate-50/50 hover:bg-slate-50/90 p-3.5 transition-all"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-800 text-xs truncate">{item.subject}</span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full font-extrabold text-[10px] uppercase tracking-wide ${
                                  item.status === 'SENT'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                }`}
                              >
                                {item.status}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500 mt-1 font-mono">{item.toEmail}</div>
                            {item.previewUrl && (
                              <a
                                href={item.previewUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block mt-2 text-[11px] text-brand-700 font-bold underline hover:text-brand-900"
                              >
                                View Ethereal Preview ↗
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Scheduled Emails Dedicated View */}
            {activeTab === 'scheduled' && (
              <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Scheduled Queue</h3>
                    <p className="text-xs text-slate-500">Emails queued for delayed transmission</p>
                  </div>
                  <span className="bg-amber-50 text-amber-700 border border-amber-200/60 text-xs font-bold px-3 py-1 rounded-full">
                    {scheduled.length} Queued
                  </span>
                </div>

                {scheduled.length === 0 ? (
                  <div className="text-center py-16 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                    <div className="text-3xl">📭</div>
                    <div className="text-sm font-bold text-slate-700 mt-2">No Scheduled Emails</div>
                    <p className="text-xs text-slate-500 mt-1">Compose a campaign to add emails to the delayed queue</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">
                          <th className="py-3 px-4">Recipient</th>
                          <th className="py-3 px-4">Subject</th>
                          <th className="py-3 px-4">Scheduled At</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                        {scheduled.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-all">
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-800">{item.toEmail}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">{item.subject}</td>
                            <td className="py-3.5 px-4 text-slate-500 font-mono">
                              {item.scheduledAt ? new Date(item.scheduledAt).toLocaleString() : '—'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/60 font-extrabold text-[10px] uppercase tracking-wider">
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              {item.status === 'SCHEDULED' && (
                                <button
                                  onClick={() => handleCancelEmail(item.id)}
                                  className="px-3 py-1 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold transition-all shadow-2xs cursor-pointer active:scale-95"
                                >
                                  Cancel
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Sent Emails Dedicated View */}
            {activeTab === 'sent' && (
              <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Sent & Delivered Log</h3>
                    <p className="text-xs text-slate-500">Complete execution record with Ethereal SMTP previews</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-bold px-3 py-1 rounded-full">
                    {sent.length} Recorded
                  </span>
                </div>

                {sent.length === 0 ? (
                  <div className="text-center py-16 bg-slate-50/70 rounded-2xl border border-dashed border-slate-200">
                    <div className="text-3xl">📬</div>
                    <div className="text-sm font-bold text-slate-700 mt-2">No Sent Records Found</div>
                    <p className="text-xs text-slate-500 mt-1">Dispatched emails will appear here as workers execute</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[10px] uppercase font-extrabold text-slate-400 tracking-wider">
                          <th className="py-3 px-4">Recipient</th>
                          <th className="py-3 px-4">Subject</th>
                          <th className="py-3 px-4">Sent At</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Preview</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                        {sent.map((item) => (
                          <tr key={item.id} className="hover:bg-slate-50/80 transition-all">
                            <td className="py-3.5 px-4 font-mono font-medium text-slate-800">{item.toEmail}</td>
                            <td className="py-3.5 px-4 font-bold text-slate-900">{item.subject}</td>
                            <td className="py-3.5 px-4 text-slate-500 font-mono">
                              {item.sentAt
                                ? new Date(item.sentAt).toLocaleString()
                                : item.failedAt
                                ? new Date(item.failedAt).toLocaleString()
                                : '—'}
                            </td>
                            <td className="py-3.5 px-4">
                              <span
                                className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase tracking-wider ${
                                  item.status === 'SENT'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                                }`}
                              >
                                {item.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              {item.previewUrl ? (
                                <a
                                  href={item.previewUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-brand-700 font-bold underline text-[11px] hover:text-brand-900"
                                >
                                  Preview ↗
                                </a>
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Senders List Dedicated View */}
            {activeTab === 'senders' && (
              <div className="rounded-3xl bg-white border border-slate-200/80 p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="font-extrabold text-slate-900 text-base">Active Sender Profiles</h3>
                    <p className="text-xs text-slate-500">Sender identities for email dispatching</p>
                  </div>
                  <span className="bg-brand-50 text-brand-700 border border-brand-200/60 text-xs font-bold px-3 py-1 rounded-full">
                    {senders.length} Active
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {senders.map((s) => (
                    <div key={s.id} className="rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 space-y-2 hover:border-slate-300 transition-all">
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-sm text-slate-900">{s.displayName}</div>
                        {s.isDefault && (
                          <span className="text-[10px] font-extrabold bg-brand-100/80 text-brand-900 px-2.5 py-0.5 rounded-full border border-brand-200/60">
                            DEFAULT SENDER
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-600">{s.email}</div>
                      <div className="text-[11px] text-slate-500 pt-2 border-t border-slate-200/60 flex items-center justify-between">
                        <span>Hourly Limit Cap</span>
                        <span className="font-bold font-mono text-slate-700">{s.hourlyLimit ?? 'Global Default (100)'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Compose Campaign Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
        senders={senders}
        onSchedule={handleSchedule}
        loading={loading}
      />

      {/* Notification Toast */}
      {toastMessage && (
        <Toast
          message={toastMessage.text}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  );
}
