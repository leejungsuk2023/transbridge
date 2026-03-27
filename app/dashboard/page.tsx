"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { PatientLang } from "@/types";

/** Maps patient language codes to display flag and Korean name */
const LANG_MAP: Record<string, { flag: string; name: string }> = {
  th: { flag: "🇹🇭", name: "태국어" },
  vi: { flag: "🇻🇳", name: "베트남어" },
  en: { flag: "🇺🇸", name: "영어" },
  id: { flag: "🇮🇩", name: "인도네시아어" },
  es: { flag: "🇪🇸", name: "스페인어" },
  mn: { flag: "🇲🇳", name: "몽골어" },
  yue: { flag: "🇭🇰", name: "광동어" },
  zh: { flag: "🇨🇳", name: "북경어" },
  ja: { flag: "🇯🇵", name: "일본어" },
  fr: { flag: "🇫🇷", name: "프랑스어" },
  de: { flag: "🇩🇪", name: "독일어" },
};

/** Format seconds into "X분 Y초" string */
function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}초`;
  if (s === 0) return `${m}분`;
  return `${m}분 ${s}초`;
}

/** Format ISO date string into "YYYY-MM-DD" */
function formatDate(dateVal: string | Date): string {
  const d = typeof dateVal === "string" ? new Date(dateVal) : dateVal;
  return d.toISOString().slice(0, 10);
}

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
  const router = useRouter();
  const [selectedLang, setSelectedLang] = useState<PatientLang | null>(null);
  const [starting, setStarting] = useState(false);

  // Real session data from Supabase
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sessions, setSessions] = useState<any[]>([]);
  const [stats, setStats] = useState({
    total: 0,
    totalMinutes: 0,
    byLang: {} as Record<string, number>,
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [fetchTick, setFetchTick] = useState(0); // increment to re-trigger fetchData
  const [hospitalName, setHospitalName] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    // Auto-abort and show error after 10 seconds
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 10000);

    async function fetchData() {
      setLoadError(false);
      setLoading(true);

      const supabase = getSupabaseBrowserClient();
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        clearTimeout(timeoutId);
        setLoading(false);
        return;
      }
      const token = authSession.access_token;

      try {
        const res = await fetch("/api/session/list?limit=100", {
          headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
          signal: controller.signal,
        });
        const result = await res.json();

        if (result.success && result.data?.sessions) {
          const sessionList = result.data.sessions;
          setSessions(sessionList);

          // Calculate stats for the current month
          type SessionRow = { startedAt: string; durationSec?: number; patientLang?: string };
          const now = new Date();
          const thisMonth = (sessionList as SessionRow[]).filter((s) => {
            const d = new Date(s.startedAt);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          });

          const totalSeconds = thisMonth.reduce(
            (sum: number, s: SessionRow) => sum + (s.durationSec || 0),
            0
          );
          const byLang: Record<string, number> = {};
          thisMonth.forEach((s: SessionRow) => {
            const lang = s.patientLang || "unknown";
            byLang[lang] = (byLang[lang] || 0) + 1;
          });

          setStats({
            total: thisMonth.length,
            totalMinutes: Math.floor(totalSeconds / 60),
            byLang,
          });
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("[Dashboard] Failed to fetch sessions:", err);
        }
        setLoadError(true);
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
      }
    }

    fetchData();

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [fetchTick]);

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
      router.push(`/session/${sessionId}?lang=${selectedLang}`);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">MedTranslate</h1>
              <p className="text-xs text-gray-500">서울성형외과</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            로그아웃
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* New session CTA */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 mb-1">새 통역 시작</h2>
            <p className="text-sm text-gray-500">환자 언어를 선택한 후 통역을 시작하세요</p>
          </div>

          {/* Language selector */}
          <div className="grid grid-cols-2 gap-3">
            {PATIENT_LANGS.map((lang) => (
              <button
                key={lang.code}
                onClick={() => setSelectedLang(lang.code)}
                className={`
                  flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition
                  ${selectedLang === lang.code
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                  }
                `}
              >
                <span className="text-3xl">{lang.flag}</span>
                <div className="text-center">
                  <p className="font-semibold text-sm">{lang.korean}</p>
                  <p className="text-xs text-gray-500">{lang.native}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Start button */}
          <button
            onClick={handleNewSession}
            disabled={!selectedLang || starting}
            className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-lg py-4 rounded-2xl transition shadow-md hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
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

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">이번달 통역</p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || loadError ? "—" : stats.total}
              {!loading && !loadError && <span className="text-sm font-normal text-gray-500 ml-1">건</span>}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">총 사용시간</p>
            <p className="text-xl font-bold text-gray-900">
              {loading || loadError ? (
                "—"
              ) : stats.totalMinutes >= 60 ? (
                <>
                  {Math.floor(stats.totalMinutes / 60)}
                  <span className="text-sm font-normal text-gray-500">시간</span>{" "}
                  {stats.totalMinutes % 60}
                  <span className="text-sm font-normal text-gray-500">분</span>
                </>
              ) : (
                <>
                  {stats.totalMinutes}
                  <span className="text-sm font-normal text-gray-500">분</span>
                </>
              )}
            </p>
          </div>
          {/* Top 2 languages by session count this month */}
          {loading || loadError ? (
            <>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">—</p>
                <p className="text-2xl font-bold text-gray-400">—</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 p-4">
                <p className="text-xs text-gray-500 mb-1">—</p>
                <p className="text-2xl font-bold text-gray-400">—</p>
              </div>
            </>
          ) : (
            (() => {
              const topLangs = Object.entries(stats.byLang)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 2);
              // Pad to always render 2 cards
              while (topLangs.length < 2) topLangs.push(["", 0]);
              const colors = ["text-blue-600", "text-green-600"];
              return topLangs.map(([code, count], i) => (
                <div key={code || `empty-${i}`} className="bg-white rounded-xl border border-gray-100 p-4">
                  <p className="text-xs text-gray-500 mb-1">
                    {code ? (LANG_MAP[code]?.name ?? code) : "—"}
                  </p>
                  <p className={`text-2xl font-bold ${code ? colors[i] : "text-gray-400"}`}>
                    {code ? count : "—"}
                    {code && <span className="text-sm font-normal text-gray-500 ml-1">건</span>}
                  </p>
                </div>
              ));
            })()
          )}
        </div>

        {/* Recent sessions table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">최근 통역 내역</h2>
          </div>
          <div className="overflow-x-auto">
            {loading ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">불러오는 중...</div>
            ) : loadError ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-gray-500 mb-3">데이터를 불러올 수 없습니다</p>
                <button
                  onClick={() => setFetchTick((t) => t + 1)}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2 transition"
                >
                  다시 불러오기
                </button>
              </div>
            ) : sessions.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">아직 통역 이력이 없습니다</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">날짜</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">언어</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">시간</th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {sessions.map((session) => {
                    const langInfo = LANG_MAP[session.patientLang] ?? { flag: "🌐", name: session.patientLang ?? "—" };
                    // A session is only considered "진행중" if status is not ended AND it started within the last 2 hours.
                    // Older non-ended sessions are orphaned (client crashed) and are shown as "완료".
                    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
                    const isActive = session.status !== "ended" && new Date(session.startedAt).getTime() > twoHoursAgo;
                    return (
                      <tr key={session.id} className="hover:bg-gray-50 transition">
                        <td className="px-5 py-3.5 text-gray-600">{formatDate(session.startedAt)}</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                            {langInfo.flag} {langInfo.name}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600">
                          {session.durationSec != null ? formatDuration(session.durationSec) : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            isActive
                              ? "bg-green-50 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}>
                            {isActive ? "진행중" : "완료"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
