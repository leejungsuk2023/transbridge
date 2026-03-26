"use client";

import { useRouter } from "next/navigation";

// Session-specific error boundary for Next.js App Router
// Shown when a rendering error occurs inside the translation session page
export default function SessionError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          통역 세션에서 오류가 발생했습니다
        </h2>
        <p className="text-gray-500 mb-6">
          {process.env.NODE_ENV === "development"
            ? error.message
            : "예기치 않은 오류가 발생했습니다."}
        </p>
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={reset}
            className="w-full max-w-xs bg-blue-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-700 transition"
          >
            다시 시도
          </button>
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full max-w-xs bg-white text-gray-700 border border-gray-300 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition"
          >
            대시보드로 돌아가기
          </button>
        </div>
      </div>
    </div>
  );
}
