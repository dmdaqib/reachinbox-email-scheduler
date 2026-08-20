export function LoginPage() {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  return (
    <div className="min-h-screen bg-[#f5f7f3] flex items-center justify-center p-6 text-slate-800">
      <div className="w-full max-w-4xl bg-white rounded-[32px] shadow-[0_20px_60px_rgba(15,23,42,0.06)] overflow-hidden border border-[#edf1ee] grid md:grid-cols-2">
        {/* Left Banner */}
        <div className="bg-[#f4f8f2] p-10 flex flex-col justify-between min-h-[480px]">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-black text-sm">
                R
              </div>
              <span className="text-xs font-bold tracking-[0.24em] text-[#556955] uppercase">
                ReachInbox
              </span>
            </div>
            <h1 className="mt-10 text-4xl font-bold text-slate-800 leading-tight">
              Email outreach, <br />
              <span className="text-brand-600">perfectly timed.</span>
            </h1>
            <p className="mt-4 text-sm text-slate-600 leading-relaxed">
              Schedule thousands of email dispatches with Redis-backed rate limiting, delay queues, and zero duplicate sends.
            </p>
          </div>

          <div className="rounded-2xl bg-white border border-[#e2ebe2] p-5 shadow-xs">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Features</div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-600 font-medium">
              <span>⚡ BullMQ Delayed Queue</span>
              <span>🔒 Multi-Worker Safe</span>
            </div>
          </div>
        </div>

        {/* Right Auth Action */}
        <div className="p-10 md:p-12 flex flex-col justify-center">
          <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Authentication</div>
          <h2 className="mt-4 text-2xl font-bold text-slate-800">Sign in to your account</h2>
          <p className="mt-2 text-xs text-slate-500">
            Use your Google account to access your ReachInbox dashboard.
          </p>

          <div className="mt-8 space-y-4">
            <button
              onClick={() => (window.location.href = `${backendUrl}/api/auth/google`)}
              className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl px-5 py-3.5 font-semibold text-sm transition-all shadow-sm hover:shadow-md cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5c1.6 0 3 .6 4.1 1.6l3.1-3.1C17.3 1.7 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.2 9 5 12 5z"
                />
                <path
                  fill="#4285F4"
                  d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.8z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 10.8 0 12s.7 2.3 1.9 4.7l3.7-2.9z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.2-6.4-5.2L1.9 16C3.7 19.7 7.5 23 12 23z"
                />
              </svg>
              Sign in with Google OAuth
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-3 text-slate-400 font-medium tracking-wider">
                  Figma Visual Match
                </span>
              </div>
            </div>

            <div className="space-y-3 opacity-60 pointer-events-none">
              <input
                disabled
                placeholder="Email address (Disabled — Google OAuth required)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"
              />
              <input
                disabled
                type="password"
                placeholder="Password (Disabled — Google OAuth required)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

