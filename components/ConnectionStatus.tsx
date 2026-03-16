"use client";

type ConnectionState = "connected" | "disconnected" | "reconnecting";

interface ConnectionStatusProps {
  isConnected: boolean;
  isReconnecting?: boolean;
}

const stateConfig: Record<ConnectionState, { color: string; dot: string; label: string }> = {
  connected: {
    color: "text-green-600",
    dot: "bg-green-500",
    label: "연결됨",
  },
  reconnecting: {
    color: "text-amber-600",
    dot: "bg-amber-500 animate-pulse",
    label: "재연결 중...",
  },
  disconnected: {
    color: "text-red-500",
    dot: "bg-red-500",
    label: "연결 끊김",
  },
};

export default function ConnectionStatus({
  isConnected,
  isReconnecting = false,
}: ConnectionStatusProps) {
  const state: ConnectionState = isConnected
    ? "connected"
    : isReconnecting
    ? "reconnecting"
    : "disconnected";

  const config = stateConfig[state];

  return (
    <div className={`flex items-center gap-1.5 text-sm font-medium ${config.color}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`} />
      <span>{config.label}</span>
    </div>
  );
}
