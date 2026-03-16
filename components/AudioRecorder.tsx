"use client";

import { useRef, useState, useCallback } from "react";

interface AudioRecorderProps {
  onAudioData: (base64Audio: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
}

export default function AudioRecorder({ onAudioData, onRecordingChange }: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array(20).fill(4));
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const animFrameRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const animateWaveform = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    // Sample 20 evenly spaced values from frequency data
    const bars = Array.from({ length: 20 }, (_, i) => {
      const idx = Math.floor((i / 20) * data.length);
      return Math.max(4, (data[idx] / 255) * 48);
    });
    setWaveform(bars);
    animFrameRef.current = requestAnimationFrame(animateWaveform);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Set up analyser for waveform visualization
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(",")[1];
          onAudioData(base64);
        };
        reader.readAsDataURL(blob);

        // Stop all tracks
        stream.getTracks().forEach((t) => t.stop());
        audioCtx.close();
        analyserRef.current = null;
        cancelAnimationFrame(animFrameRef.current);
        setWaveform(Array(20).fill(4));
      };

      mediaRecorder.start();
      setIsRecording(true);
      onRecordingChange?.(true);
      animFrameRef.current = requestAnimationFrame(animateWaveform);
    } catch (err) {
      console.error("Failed to start recording:", err);
    }
  }, [onAudioData, onRecordingChange, animateWaveform]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    onRecordingChange?.(false);
  }, [onRecordingChange]);

  return (
    <div className="flex flex-col items-center gap-4 w-full">
      {/* Waveform visualization */}
      <div className="flex items-center gap-0.5 h-12 px-4">
        {waveform.map((height, i) => (
          <div
            key={i}
            className={`w-1.5 rounded-full transition-all duration-75 ${
              isRecording ? "bg-red-400" : "bg-gray-300"
            }`}
            style={{ height: `${height}px` }}
          />
        ))}
      </div>

      {/* Push-to-talk button */}
      <button
        onPointerDown={startRecording}
        onPointerUp={stopRecording}
        onPointerLeave={stopRecording}
        className={`w-20 h-20 rounded-full flex items-center justify-center shadow-lg transition-all select-none touch-none ${
          isRecording
            ? "bg-red-500 scale-110 shadow-red-200 shadow-xl ring-4 ring-red-200"
            : "bg-blue-600 hover:bg-blue-700 active:scale-95"
        }`}
      >
        <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      </button>

      <span className={`text-sm font-medium ${isRecording ? "text-red-500" : "text-gray-600"}`}>
        {isRecording ? "말하는 중..." : "말하기"}
      </span>
    </div>
  );
}
