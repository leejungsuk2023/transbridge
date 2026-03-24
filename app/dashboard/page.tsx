"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { PatientLang } from "@/types";

const mockSessions = [
  { id: "1", date: "2024-01-15", language: "태국어", duration: "12분 30초", status: "완료" },
  { id: "2", date: "2024-01-15", language: "베트남어", duration: "8분 15초", status: "완료" },
  { id: "3", date: "2024-01-14", language: "태국어", duration: "23분 45초", status: "완료" },
  { id: "4", date: "2024-01-14", language: "태국어", duration: "5분 20초", status: "완료" },
  { id: "5", date: "2024-01-13", language: "베트남어", duration: "15분 10초", status: "완료" },
];

const PATIENT_LANGS: { code: PatientLang; flag: string; native: string; korean: string }[] = [
  { code: "th", flag: "🇹🇭", native: "ภาษาไทย", korean: "태국어" },
  { code: "vi", flag: "🇻🇳", native: "Tiếng Việt", korean: "베트남어" },
  { code: "en", flag: "🇺🇸", native: "English", korean: "영어" },
  { code: "id", flag: "🇮🇩", native: "Bahasa Indonesia", korean: "인도네시아어" },
  { code: "es", flag: "🇪🇸", native: "Español", korean: "스페인어" },
];

export default function DashboardPage() {
  const router = useRouter();
  const [selectedLang, setSelectedLang] = useState<PatientLang | null>(null);
  const [starting, setStarting] = useState(false);

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
              `${selectedLang ? (selectedLang === "th" ? "🇹🇭 태국어" : "🇻🇳 베트남어") : ""} 통역 시작`
            )}
          </button>
        </div>

        {/* Stats cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">이번달 통역</p>
            <p className="text-2xl font-bold text-gray-900">32<span className="text-sm font-normal text-gray-500 ml-1">건</span></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">총 사용시간</p>
            <p className="text-xl font-bold text-gray-900">4<span className="text-sm font-normal text-gray-500">시간</span> 20<span className="text-sm font-normal text-gray-500">분</span></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">태국어</p>
            <p className="text-2xl font-bold text-blue-600">20<span className="text-sm font-normal text-gray-500 ml-1">건</span></p>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">베트남어</p>
            <p className="text-2xl font-bold text-green-600">12<span className="text-sm font-normal text-gray-500 ml-1">건</span></p>
          </div>
        </div>

        {/* Recent sessions table */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50">
            <h2 className="font-semibold text-gray-900">최근 통역 내역</h2>
          </div>
          <div className="overflow-x-auto">
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
                {mockSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-gray-50 transition">
                    <td className="px-5 py-3.5 text-gray-600">{session.date}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        session.language === "태국어"
                          ? "bg-blue-50 text-blue-700"
                          : "bg-green-50 text-green-700"
                      }`}>
                        {session.language === "태국어" ? "🇹🇭" : "🇻🇳"} {session.language}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-gray-600">{session.duration}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {session.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
