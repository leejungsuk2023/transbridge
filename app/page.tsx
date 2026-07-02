"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Redirect if already logged in
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace("/dashboard");
      } else {
        setCheckingAuth(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        router.replace("/dashboard");
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("이메일과 비밀번호를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) {
        if (authError.message.toLowerCase().includes("invalid")) {
          setError("이메일 또는 비밀번호가 올바르지 않습니다.");
        } else if (authError.message.toLowerCase().includes("rate")) {
          setError("너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주세요.");
        } else {
          setError("로그인 중 오류가 발생했습니다.");
        }
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-sky-200 via-indigo-200 to-fuchsia-200">
        {/* Blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -left-20 w-72 h-72 rounded-full bg-blue-400/30 blur-3xl" />
          <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-fuchsia-400/30 blur-3xl" />
        </div>
        <svg className="animate-spin w-10 h-10 text-blue-600 drop-shadow-lg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-sky-200 via-indigo-200 to-fuchsia-200 px-4 overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-blue-400/30 blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 -right-24 w-80 h-80 rounded-full bg-fuchsia-400/25 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 left-1/4 w-72 h-72 rounded-full bg-indigo-400/25 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          {/* Soft glow behind logo */}
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-500/30 to-fuchsia-500/30 blur-2xl scale-150" />
            <img src="/logo.png" alt="TransBridge" className="relative w-40 h-auto mx-auto" />
          </div>
          <p className="text-sm font-medium bg-gradient-to-r from-blue-600 to-fuchsia-600 bg-clip-text text-transparent mt-1">
            실시간 의료 통역 서비스
          </p>
        </div>

        {/* Login Form — glassy card */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-indigo-500/10 border border-white/60 p-6 space-y-4"
        >
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hospital@example.com"
              className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/60 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-fuchsia-400/40 transition shadow-sm"
              autoComplete="email"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1.5"
            >
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-xl bg-white/70 border border-white/60 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-fuchsia-400/40 transition shadow-sm"
              autoComplete="current-password"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="bg-red-50/80 backdrop-blur-sm text-red-600 text-sm px-4 py-3 rounded-2xl border border-red-100/60">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-fuchsia-600 hover:from-blue-500 hover:to-fuchsia-500 active:brightness-95 text-white font-semibold py-3 rounded-2xl transition shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg
                  className="animate-spin w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                로그인 중...
              </span>
            ) : (
              "로그인"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-indigo-400/80 mt-6">
          &copy; 2024 MedTranslate. All rights reserved.
        </p>
      </div>
    </div>
  );
}
