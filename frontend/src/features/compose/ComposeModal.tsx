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
    new Date(Date.now() + 60000).toISOString().slice(0, 16),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 md:p-8">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
          <div>
            <h2 className="text-xl font-bold text-slate-800">Compose Email Campaign</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Schedule automated, rate-limited email delivery
            </p>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center text-sm transition-all"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Sender Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              From Sender
            </label>
            <select
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-brand-500 focus:bg-white transition-all"
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
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Subject Line *
            </label>
            <input
              required
              type="text"
              placeholder="e.g. Welcome to Our Platform"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:bg-white transition-all"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          {/* Email Body */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
              Email Body *
            </label>
            <textarea
              required
              rows={5}
              placeholder="Write your email content here..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:bg-white transition-all"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>

          {/* Recipient Upload & Manual Input */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                Recipients (CSV / TXT or Manual) *
              </label>
              <span className="text-xs font-bold bg-brand-100 text-brand-800 px-2.5 py-1 rounded-full">
                {detectedCount} unique lead{detectedCount === 1 ? '' : 's'} detected
              </span>
            </div>

            {/* CSV File Upload */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Upload CSV or TXT File</label>
              <input
                type="file"
                accept=".csv,.txt"
                onChange={handleFileChange}
                className="w-full text-xs text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
              />
            </div>

            {/* Manual Textarea */}
            <div>
              <label className="block text-xs text-slate-500 mb-1">
                Or Paste Email Addresses (comma, line separated)
              </label>
              <textarea
                rows={3}
                placeholder="alice@example.com, bob@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500 transition-all"
                value={recipientsText}
                onChange={(e) => setRecipientsText(e.target.value)}
              />
            </div>
          </div>

          {/* Scheduling Configuration Controls */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Start Time *
              </label>
              <input
                required
                type="datetime-local"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500 focus:bg-white transition-all"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Min Delay (ms)
              </label>
              <input
                type="number"
                min={0}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500 focus:bg-white transition-all"
                value={delayMs}
                onChange={(e) => setDelayMs(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Hourly Limit
              </label>
              <input
                type="number"
                min={1}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 outline-none focus:border-brand-500 focus:bg-white transition-all"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || (detectedCount === 0 && !recipientsText && !file)}
              className="px-6 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold shadow-sm hover:shadow-md shadow-brand-600/20 disabled:opacity-50 transition-all"
            >
              {loading ? 'Scheduling...' : 'Schedule Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
