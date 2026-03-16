"use client";

import { useEffect, useRef, useState } from "react";

interface AudioPlayerProps {
  audioData: string; // base64 audio
}

export default function AudioPlayer({ audioData }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(Array(16).fill(4));
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    if (!audioData) return;

    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let isCancelled = false;

    const play = async () => {
      try {
        // Decode base64 to ArrayBuffer
        const binary = atob(audioData);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }

        audioCtx = new AudioContext();
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;

        const buffer = await audioCtx.decodeAudioData(bytes.buffer);
        if (isCancelled) return;

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        sourceRef.current = source;

        setIsPlaying(true);

        // Animate waveform
        const animate = () => {
          if (!analyser) return;
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          const bars = Array.from({ length: 16 }, (_, i) => {
            const idx = Math.floor((i / 16) * data.length);
            return Math.max(4, (data[idx] / 255) * 36);
          });
          setWaveform(bars);
          animFrameRef.current = requestAnimationFrame(animate);
        };
        animFrameRef.current = requestAnimationFrame(animate);

        source.onended = () => {
          if (!isCancelled) {
            setIsPlaying(false);
            setWaveform(Array(16).fill(4));
            cancelAnimationFrame(animFrameRef.current);
          }
        };

        source.start();
      } catch {
        // Audio data may be mock — silently ignore decode errors
        setIsPlaying(false);
      }
    };

    play();

    return () => {
      isCancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      sourceRef.current?.stop();
      audioCtx?.close();
    };
  }, [audioData]);

  if (!isPlaying) return null;

  return (
    <div className="flex items-center gap-2 bg-green-50 border border-green-100 rounded-2xl px-4 py-3">
      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
        </svg>
      </div>
      <div className="flex items-center gap-0.5 h-8">
        {waveform.map((height, i) => (
          <div
            key={i}
            className="w-1 rounded-full bg-green-400 transition-all duration-75"
            style={{ height: `${height}px` }}
          />
        ))}
      </div>
      <span className="text-xs text-green-600 font-medium ml-1">재생 중</span>
    </div>
  );
}
