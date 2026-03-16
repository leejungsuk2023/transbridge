"use client";

import { PatientLang } from "@/types";

interface LanguageSelectorProps {
  onSelect: (lang: PatientLang) => void;
}

const languages: { code: PatientLang; flag: string; native: string; korean: string }[] = [
  { code: "th", flag: "🇹🇭", native: "ภาษาไทย", korean: "태국어" },
  { code: "vi", flag: "🇻🇳", native: "Tiếng Việt", korean: "베트남어" },
];

export default function LanguageSelector({ onSelect }: LanguageSelectorProps) {
  return (
    <div className="flex flex-col gap-4 w-full">
      {languages.map((lang) => (
        <button
          key={lang.code}
          onClick={() => onSelect(lang.code)}
          className="w-full bg-white/10 hover:bg-white/20 active:bg-white/30 backdrop-blur-sm border border-white/20 text-white rounded-2xl p-5 flex items-center gap-4 transition"
        >
          <span className="text-4xl">{lang.flag}</span>
          <div className="text-left">
            <p className="text-xl font-bold">{lang.native}</p>
            <p className="text-sm text-blue-200">{lang.korean}</p>
          </div>
          <svg
            className="w-5 h-5 text-white/50 ml-auto"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      ))}
    </div>
  );
}
