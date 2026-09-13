/**
 * Native audio bridge for the Capacitor Android shell.
 * Wraps the custom "NativeAudio" plugin (Java side, registered separately) which
 * captures the mic (16kHz PCM16) and plays TTS (24kHz PCM16) through the OS audio
 * stack with hardware acoustic echo cancellation — unlike the web path, this lets
 * the mic stay open while TTS plays (full duplex, real barge-in).
 */

import { Capacitor, registerPlugin, PluginListenerHandle } from "@capacitor/core";

export type MicPermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

export interface NativeAudioPlugin {
  checkPermissions(): Promise<{ microphone: MicPermissionState }>;
  requestPermissions(): Promise<{ microphone: MicPermissionState }>;
  /** Starts 16kHz PCM16 mic capture (AEC on) + 24kHz playback track. */
  start(): Promise<void>;
  /** Tears everything down. */
  stop(): Promise<void>;
  /** Enqueue a base64-encoded PCM16 24kHz mono chunk for playback. */
  playPcm(opts: { data: string }): Promise<void>;
  /** Barge-in: drop queued audio, flush the playback track. */
  stopPlayback(): Promise<void>;
  /** Fires ~8x/sec with base64 PCM16 16kHz mic audio. */
  addListener(
    eventName: "chunk",
    listenerFunc: (event: { data: string }) => void
  ): Promise<PluginListenerHandle>;
  /** True when TTS starts, false ~300ms after the playback queue drains. */
  addListener(
    eventName: "playbackState",
    listenerFunc: (event: { playing: boolean }) => void
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const NativeAudio = registerPlugin<NativeAudioPlugin>("NativeAudio");

/**
 * True only when running inside the Capacitor native (Android) shell.
 * Safe to call during SSR — `window`/`Capacitor` don't exist on the server.
 */
export function isNativeApp(): boolean {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}
