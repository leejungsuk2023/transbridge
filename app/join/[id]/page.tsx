"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import LanguageSelector from "@/components/LanguageSelector";
import { PatientLang } from "@/types";

type Step = "language" | "microphone" | "ready";

const micText: Record<PatientLang, { instruction: string; start: string }> = {
  th: {
    instruction: "กรุณาอนุญาตให้ใช้ไมโครโฟน",
    start: "เริ่มต้น",
  },
  vi: {
    instruction: "Vui lòng cho phép sử dụng micrô",
    start: "Bắt đầu",
  },
  en: {
    instruction: "Please allow microphone access",
    start: "Start",
  },
  id: {
    instruction: "Silakan izinkan akses mikrofon",
    start: "Mulai",
  },
  es: {
    instruction: "Por favor, permita el acceso al micrófono",
    start: "Comenzar",
  },
  mn: {
    instruction: "Микрофон руу нэвтрэхийг зөвшөөрнө үү",
    start: "Эхлэх",
  },
  yue: { instruction: "請允許使用麥克風", start: "開始" },
  zh: { instruction: "请允许使用麦克风", start: "开始" },
  ja: { instruction: "マイクへのアクセスを許可してください", start: "開始" },
  fr: { instruction: "Veuillez autoriser l'accès au microphone", start: "Commencer" },
  de: { instruction: "Bitte erlauben Sie den Zugriff auf das Mikrofon", start: "Starten" },
};

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [step, setStep] = useState<Step>("language");
  const [selectedLang, setSelectedLang] = useState<PatientLang | null>(null);
  const [micStatus, setMicStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");

  const handleLanguageSelect = (lang: PatientLang) => {
    setSelectedLang(lang);
    setStep("microphone");
  };

  const handleMicRequest = async () => {
    setMicStatus("requesting");
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStatus("granted");
      setStep("ready");
    } catch {
      setMicStatus("denied");
    }
  };

  // Auto-navigate to session once mic is granted
  useEffect(() => {
    if (step === "ready" && selectedLang) {
      const timer = setTimeout(() => {
        router.push(`/session/${sessionId}?role=patient&lang=${selectedLang}`);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [step, selectedLang, sessionId, router]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 flex flex-col items-center justify-center px-4">
      {/* Step 1: Language selection */}
      {step === "language" && (
        <div className="w-full max-w-sm text-center">
          <div className="mb-8">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
            </div>
            <h1 className="text-white font-bold text-xl mb-1">언어를 선택하세요</h1>
            <p className="text-blue-200 text-base">กรุณาเลือกภาษา</p>
            <p className="text-blue-200 text-base">Vui lòng chọn ngôn ngữ</p>
          </div>
          <LanguageSelector onSelect={handleLanguageSelect} />
        </div>
      )}

      {/* Step 2: Microphone permission */}
      {step === "microphone" && selectedLang && (
        <div className="w-full max-w-sm text-center">
          <div className="bg-white rounded-3xl p-8 shadow-xl">
            {/* Mic icon */}
            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>

            <p className="text-gray-800 font-semibold text-lg mb-2">
              {micText[selectedLang].instruction}
            </p>

            {micStatus === "denied" && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
                {selectedLang === "th"
                  ? "ไม่สามารถเข้าถึงไมโครโฟนได้ กรุณาอนุญาตในการตั้งค่า"
                  : "Không thể truy cập micrô. Vui lòng cho phép trong cài đặt."}
              </div>
            )}

            <button
              onClick={handleMicRequest}
              disabled={micStatus === "requesting"}
              className="w-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold py-4 rounded-2xl transition text-lg disabled:opacity-60"
            >
              {micStatus === "requesting" ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  ...
                </span>
              ) : (
                micText[selectedLang].start
              )}
            </button>
          </div>

          <button
            onClick={() => setStep("language")}
            className="mt-4 text-blue-200 hover:text-white text-sm transition"
          >
            {selectedLang === "th" ? "← กลับ" : "← Quay lại"}
          </button>
        </div>
      )}

      {/* Step 3: Transition screen */}
      {step === "ready" && (
        <div className="text-center">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-white font-semibold text-xl">
            {selectedLang === "th" ? "กำลังเริ่มต้น..." : "Đang bắt đầu..."}
          </p>
        </div>
      )}
    </div>
  );
}
