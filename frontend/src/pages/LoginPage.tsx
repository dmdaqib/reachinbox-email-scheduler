export function LoginPage() {
  const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  return (
    <div className="min-h-screen bg-[#f5f7f3] flex items-center justify-center p-6 text-slate-800 font-sans">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-200/80 grid md:grid-cols-2">
        {/* Left Banner */}
        <div className="bg-gradient-to-b from-[#f4f8f2] to-[#eaf2e8] p-8 md:p-10 flex flex-col justify-between min-h-[460px]">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center text-white font-black text-base shadow-md shadow-brand-600/20">
                R
              </div>
              <span className="text-xs font-black tracking-[0.24em] text-brand-900 uppercase">
                ReachInbox
              </span>
            </div>
            <h1 className="mt-10 text-3xl md:text-4xl font-extrabold text-slate-900 leading-tight">
              Email outreach, <br />
              <span className="text-brand-700">perfectly timed.</span>
            </h1>
            <p className="mt-4 text-xs md:text-sm text-slate-600 leading-relaxed font-normal">
              Schedule thousands of email dispatches with Redis-backed rate limiting, BullMQ delay queues, and zero duplicate sends.
            </p>
          </div>

          <div className="rounded-2xl bg-white/90 backdrop-blur-xs border border-brand-200/60 p-4 shadow-xs">
            <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Platform Features</div>
            <div className="mt-2.5 flex items-center justify-between text-xs text-slate-700 font-semibold">
              <span>⚡ BullMQ Delay Queue</span>
              <span>🔒 Multi-Worker Safe</span>
            </div>
          </div>
        </div>

        {/* Right Auth Action */}
        <div className="p-8 md:p-12 flex flex-col justify-center bg-white">
          <div className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">Authentication</div>
          <h2 className="mt-3 text-2xl font-black text-slate-900 tracking-tight">Sign in to your account</h2>
          <p className="mt-1.5 text-xs text-slate-500">
            Use your Google account to access your ReachInbox email dashboard.
          </p>

          <div className="mt-8 space-y-4">
            <button
              onClick={() => (window.location.href = `${backendUrl}/api/auth/google`)}
              className="w-full flex items-center justify-center gap-3 bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white rounded-2xl px-5 py-3.5 font-bold text-xs transition-all shadow-md cursor-pointer"
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
              <span>Sign in with Google OAuth</span>
            </button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200/80" />
              </div>
              <div className="relative flex justify-center text-[10px] uppercase">
                <span className="bg-white px-3 text-slate-400 font-bold tracking-widest">
                  Figma Visual Match
                </span>
              </div>
            </div>

            <div className="space-y-3 opacity-50 pointer-events-none">
              <input
                disabled
                placeholder="Email address (Google OAuth required)"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500"
              />
              <input
                disabled
                type="password"
                placeholder="Password (Google OAuth required)"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

