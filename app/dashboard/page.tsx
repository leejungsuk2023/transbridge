"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { PatientLang } from "@/types";
import { BUILD_SHA, useReloadOnNewBuild } from "@/lib/build-version";

const PATIENT_LANGS: { code: PatientLang; flag: string; native: string; korean: string }[] = [
  { code: "th", flag: "🇹🇭", native: "ภาษาไทย", korean: "태국어" },
  { code: "vi", flag: "🇻🇳", native: "Tiếng Việt", korean: "베트남어" },
  { code: "en", flag: "🇺🇸", native: "English", korean: "영어" },
  { code: "id", flag: "🇮🇩", native: "Bahasa Indonesia", korean: "인도네시아어" },
  { code: "es", flag: "🇪🇸", native: "Español", korean: "스페인어" },
  { code: "mn", flag: "🇲🇳", native: "Монгол хэл", korean: "몽골어" },
  { code: "yue", flag: "🇭🇰", native: "廣東話", korean: "광동어" },
  { code: "zh", flag: "🇨🇳", native: "普通话", korean: "북경어" },
  { code: "ja", flag: "🇯🇵", native: "日本語", korean: "일본어" },
  { code: "fr", flag: "🇫🇷", native: "Français", korean: "프랑스어" },
  { code: "de", flag: "🇩🇪", native: "Deutsch", korean: "독일어" },
];

export default function DashboardPage() {
  useReloadOnNewBuild();
  const router = useRouter();
  const [selectedLang, setSelectedLang] = useState<PatientLang | null>(null);
  const [starting, setStarting] = useState(false);
  // Experimental dual-channel (2CH) interpretation mode — staff headset +
  // phone built-in mic/speaker as two independent one-direction sessions.
  // Native-app only; persisted per-device so the choice survives a reload.
  const [dualEngine, setDualEngine] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("mt_dual_engine") === "1") setDualEngine(true);
    } catch {
      // Ignore — private browsing / storage disabled
    }
  }, []);
  const toggleDualEngine = () => {
    setDualEngine((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("mt_dual_engine", next ? "1" : "0");
      } catch {
        // Ignore
      }
      return next;
    });
  };

  const [hospitalName, setHospitalName] = useState("");

  // Fetch the hospital name for the logged-in user (cosmetic header text).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession || cancelled) return;
      try {
        const { data: hospital } = await supabase
          .from("hospitals")
          .select("name")
          .eq("auth_user_id", authSession.user.id)
          .single();
        if (hospital?.name && !cancelled) setHospitalName(hospital.name);
      } catch {
        // Ignore — hospital name is cosmetic
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleNewSession = async () => {
    if (!selectedLang) return;
    setStarting(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const token = authSession?.access_token;
      console.log('[Dashboard] Auth session:', authSession ? 'exists' : 'null', 'token:', token ? token.slice(0, 10) + '...' : 'null');

      if (!token) {
        // No token — try refreshing session first
        const { data: { session: refreshed } } = await supabase.auth.refreshSession();
        if (!refreshed?.access_token) {
          // Still no token — redirect to login
          router.push("/");
          return;
        }
      }

      const finalToken = token || (await supabase.auth.getSession()).data.session?.access_token;

      const res = await fetch("/api/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(finalToken ? { "Authorization": `Bearer ${finalToken}` } : {}),
        },
        body: JSON.stringify({ patientLang: selectedLang }),
      });
      const data = await res.json();
      console.log('[Dashboard] Session API response:', JSON.stringify(data));
      // API returns { success: true, data: { session: { id, ... } } }
      const sessionId = data.data?.session?.id;
      if (!sessionId) {
        console.error('[Dashboard] No session ID in response:', data);
        alert('세션 생성에 실패했습니다. 다시 시도해주세요.');
        return;
      }
      router.push(`/session/${sessionId}?lang=${selectedLang}${dualEngine ? "&engine=dual" : ""}`);
    } catch (err) {
      console.error('[Dashboard] Session creation error:', err);
      alert('세션 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setStarting(false);
    }
  };

  const handleLogout = async () => {
    await getSupabaseBrowserClient().auth.signOut();
    router.push("/");
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-sky-100 via-indigo-100 to-fuchsia-100 overflow-x-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -right-24 w-96 h-96 rounded-full bg-fuchsia-400/15 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 left-1/3 w-72 h-72 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="bg-white/70 backdrop-blur-xl border-b border-white/60 shadow-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="TransBridge" className="w-28 h-auto" />
            <div>
              <p className="text-xs font-medium text-indigo-500">{hospitalName || "병원"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-gray-400">v{BUILD_SHA}</span>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-fuchsia-600 flex items-center gap-1.5 transition hover:-translate-y-0.5"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <div className="relative max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* New session CTA */}
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl border border-white/60 shadow-xl shadow-indigo-500/10 p-6 space-y-5">
          <div>
            <h2 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-fuchsia-600 bg-clip-text text-transparent mb-1">
              새 통역 시작
            </h2>
            <p className="text-sm text-gray-500">환자 언어를 선택한 후 통역을 시작하세요</p>
          </div>

          {/* Language selector */}
          <div className="grid grid-cols-2 gap-3">
            {PATIENT_LANGS.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setSelectedLang(lang.code)}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition hover:-translate-y-0.5
                  ${selectedLang === lang.code
                    ? "border-transparent bg-gradient-to-br from-blue-600 to-fuchsia-600 text-white shadow-lg shadow-blue-500/30 ring-2 ring-blue-400/40"
                    : "border-white/60 bg-white/60 backdrop-blur-sm text-gray-700 hover:border-indigo-300/60 hover:bg-white/80 hover:shadow-md hover:shadow-indigo-200/40"
                  }
                `}
              >
                <span className="text-3xl">{lang.flag}</span>
                <div className="text-center">
                  <p className={`font-semibold text-sm ${selectedLang === lang.code ? "text-white" : "text-gray-800"}`}>
                    {lang.korean}
                  </p>
                  <p className={`text-xs ${selectedLang === lang.code ? "text-white/80" : "text-gray-500"}`}>
                    {lang.native}
                  </p>
                </div>
              </button>
            ))}
          </div>

          {/* Dual-channel (2CH) experimental mode toggle */}
          <label className="flex items-center gap-2 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={dualEngine}
              onChange={toggleDualEngine}
              className="w-4 h-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
            />
            <span className="text-sm text-gray-600">
              🎧 2채널 모드 (직원 이어폰 필요 · 실험)
            </span>
          </label>

          {/* Start button */}
          <button
            onClick={handleNewSession}
            disabled={!selectedLang || starting}
            className="w-full bg-gradient-to-r from-blue-600 to-fuchsia-600 hover:from-blue-500 hover:to-fuchsia-500 active:brightness-95 text-white font-bold text-lg py-4 rounded-2xl transition shadow-lg shadow-blue-500/30 hover:-translate-y-0.5 hover:shadow-xl hover:shadow-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-y-0 disabled:shadow-md"
          >
            {starting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                시작 중...
              </span>
            ) : (
              `${selectedLang ? `${PATIENT_LANGS.find(l => l.code === selectedLang)?.flag ?? ""} ${PATIENT_LANGS.find(l => l.code === selectedLang)?.korean ?? ""}` : ""} 통역 시작`
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
