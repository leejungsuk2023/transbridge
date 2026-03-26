"use client";

import { useState, useEffect } from "react";

// Overlay displayed when the browser loses internet connectivity.
// Listens to the window online/offline events and auto-dismisses when connection is restored.
export default function OfflineOverlay() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const handleOffline = () => setIsOffline(true);
    const handleOnline = () => setIsOffline(false);

    // Sync with current state on mount
    setIsOffline(!navigator.onLine);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 max-w-sm text-center mx-4">
        <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-6 h-6 text-yellow-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m-2.829-2.829a5 5 0 000-7.07m-4.243 4.243a1 1 0 010-1.414"
            />
          </svg>
        </div>
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          인터넷 연결 끊김
        </h3>
        <p className="text-gray-500 text-sm">
          인터넷 연결을 확인해주세요. 연결이 복구되면 자동으로 재개됩니다.
        </p>
      </div>
    </div>
  );
}
