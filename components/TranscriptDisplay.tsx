"use client";

import { TranslationMessage, UserRole } from "@/types";

interface TranscriptDisplayProps {
  messages: TranslationMessage[];
  currentRole: UserRole;
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function TranscriptDisplay({ messages, currentRole }: TranscriptDisplayProps) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-gray-400">
        <svg className="w-10 h-10 mb-2 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <p className="text-sm">아직 대화가 없습니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {messages.map((message) => {
        const isMyMessage = message.speaker === currentRole;

        return (
          <div
            key={message.id}
            className={`flex flex-col gap-1 ${isMyMessage ? "items-end" : "items-start"}`}
          >
            {/* Sender label */}
            <span className="text-xs text-gray-400 px-1">
              {isMyMessage ? "나" : "상대방"} · {formatTime(message.timestamp)}
            </span>

            {/* Message bubble */}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              isMyMessage
                ? "bg-blue-600 text-white rounded-br-sm"
                : "bg-white border border-gray-100 shadow-sm rounded-bl-sm"
            }`}>
              {isMyMessage ? (
                // My message: show original text (Korean for staff, native for patient)
                <p className="text-sm leading-relaxed">{message.originalText}</p>
              ) : (
                // Their message: translated text large, original text small below
                <div className="space-y-1.5">
                  <p className="text-base font-medium text-gray-900 leading-relaxed">
                    {message.translatedText}
                  </p>
                  <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-100 pt-1.5">
                    {message.originalText}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
