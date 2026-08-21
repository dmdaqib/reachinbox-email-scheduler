import React, { useMemo, useState } from 'react';
import type { Sender } from '../../types';

type ComposeModalProps = {
  isOpen: boolean;
  onClose: () => void;
  senders: Sender[];
  onSchedule: (payload: {
    subject: string;
    body: string;
    startAt: string;
    delayMs: number;
    hourlyLimit: number;
    senderId?: string;
    recipientsText: string;
    file?: File | null;
  }) => Promise<void>;
  loading: boolean;
};

function toLocalDatetimeString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export const ComposeModal: React.FC<ComposeModalProps> = ({
  isOpen,
  onClose,
  senders,
  onSchedule,
  loading,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [recipientsText, setRecipientsText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileText, setFileText] = useState<string>('');
  const [startAt, setStartAt] = useState<string>(
    toLocalDatetimeString(new Date(Date.now() + 60000)),
  );
  const [delayMs, setDelayMs] = useState<number>(2000);
  const [hourlyLimit, setHourlyLimit] = useState<number>(100);
  const [senderId, setSenderId] = useState<string>('');

  // Client-side recipient count preview
  const detectedCount = useMemo(() => {
    const emails = new Set<string>();
    const emailRegex = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

    if (recipientsText) {
      const matches = recipientsText.match(emailRegex) || [];
      matches.forEach((m) => emails.add(m.toLowerCase()));
    }

    if (fileText) {
      const matches = fileText.match(emailRegex) || [];
      matches.forEach((m) => emails.add(m.toLowerCase()));
    }

    return emails.size;
  }, [recipientsText, fileText]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    setFile(selectedFile);
    if (selectedFile) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        setFileText((evt.target?.result as string) || '');
      };
      reader.readAsText(selectedFile);
    } else {
      setFileText('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSchedule({
      subject,
      body,
      startAt,
      delayMs,
      hourlyLimit,
      senderId: senderId || senders[0]?.id,
      recipientsText,
      file,
    });
    // Reset form after submission
    setSubject('');
    setBody('');
    setRecipientsText('');
    setFile(null);
    setFileText('');
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-all"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-50 bg-white rounded-3xl border border-slate-300 shadow-2xl shadow-slate-950/40 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 md:p-8 space-y-6"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-brand-600" />
              <h2 className="text-xl font-black text-slate-900 tracking-tight">Compose Email Campaign</h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Schedule rate-limited, persistent email delivery with Redis delay queueing
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 font-bold flex items-center justify-center text-sm transition-all cursor-pointer border border-slate-200"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Sender Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              From Sender Profile
            </label>
            <select
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-medium text-slate-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all cursor-pointer shadow-2xs"
              value={senderId || (senders[0]?.id ?? '')}
              onChange={(e) => setSenderId(e.target.value)}
            >
              {senders.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName} &lt;{s.email}&gt; {s.isDefault ? '(Default)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Subject Line *
            </label>
            <input
              required
              type="text"
              placeholder="e.g. Welcome to Our Platform"
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs text-slate-900 font-medium placeholder-slate-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all shadow-2xs"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Email Content (Body) *
            </label>
            <textarea
              required
              rows={4}
              placeholder="Write your email body content here..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-500/20 transition-all leading-relaxed shadow-2xs"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Recipient Upload & Manual Input */}
          <div className="rounded-2xl border border-slate-200 bg-slate-100/70 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-800 uppercase tracking-wider">
                Recipients List (CSV / TXT / Manual) *
              </label>
              <span className="text-xs font-extrabold bg-brand-600 text-white px-3 py-1 rounded-full shadow-xs">
                ✨ {detectedCount} unique lead{detectedCount === 1 ? '' : 's'} detected
              </span>
            </div>

            {/* CSV File Upload */}
            <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-3.5 hover:border-brand-500 transition-all">
              <div className="text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>Upload CSV or TXT File</span>
                <span className="text-slate-400 font-mono">.csv, .txt</span>
              </div>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-brand-50 file:text-brand-800 hover:file:bg-brand-100 cursor-pointer"
              />
            </div>

            {/* Manual Textarea */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Or Paste Email Addresses (comma, semicolon, or newline separated)
              </label>
              <textarea
                rows={2}
                placeholder="alice@example.com, bob@example.com"
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 font-mono outline-none focus:border-brand-600 transition-all shadow-2xs"
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
              />
            </div>
          </div>

          {/* Scheduling Configuration Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 bg-slate-100/70 p-3.5 rounded-2xl border border-slate-200">
            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Start Time (Local) *
              </label>
              <input
                required
                type="datetime-local"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 font-bold outline-none focus:border-brand-600 transition-all font-mono"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Min Delay (ms)
              </label>
              <input
                type="number"
                min={0}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 font-bold outline-none focus:border-brand-600 transition-all font-mono"
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
              />
            </div>

            <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
              <label className="block text-[10px] font-extrabold text-slate-600 uppercase tracking-wider mb-1">
                Hourly Limit
              </label>
              <input
                type="number"
                min={1}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 font-bold outline-none focus:border-brand-600 transition-all font-mono"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition-all cursor-pointer shadow-2xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (detectedCount === 0 && !recipientsText && !file)}
              className="px-6 py-2.5 rounded-2xl bg-brand-600 hover:bg-brand-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-brand-600/20 disabled:opacity-50 transition-all cursor-pointer flex items-center gap-2"
            >
              {loading && <span className="animate-spin text-sm">🔄</span>}
              <span>{loading ? 'Scheduling...' : 'Schedule Campaign'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
