/**
 * Native audio bridge for the Capacitor Android shell.
 * Wraps the custom "NativeAudio" plugin (Java side, registered separately) which
 * captures the mic (16kHz PCM16) and plays TTS (24kHz PCM16) through the OS audio
 * stack with hardware acoustic echo cancellation — unlike the web path, this lets
 * the mic stay open while TTS plays (full duplex, real barge-in).
 *
 * Dual mode: on top of the single-mic full-duplex path above, the plugin can also
 * route two independent audio channels — the staff's headset ("staff") and the
 * phone's built-in mic/speaker ("patient") — so each direction of a bidirectional
 * conversation can run its own one-way translation session without the two
 * directions bleeding into each other's mic. `mode` defaults to 'single'; single
 * mode ignores the `channel` field on every event (always 'main' behavior).
 */

import { Capacitor, registerPlugin, PluginListenerHandle } from "@capacitor/core";

export type MicPermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

/** 'main' is the single-mode channel; 'staff'/'patient' are dual-mode channels. */
export type Channel = "main" | "staff" | "patient";

export interface DeviceReport {
  mode: "single" | "dual";
  devices: {
    staffIn: string;
    patientIn: string;
    staffOut: string;
    patientOut: string;
  };
}

export interface NativeAudioPlugin {
  checkPermissions(): Promise<{ microphone: MicPermissionState }>;
  requestPermissions(): Promise<{ microphone: MicPermissionState }>;
  /**
   * Starts mic capture (16kHz PCM16) + playback track(s) (24kHz PCM16).
   * `mode: 'dual'` routes the staff headset and the phone's built-in mic/speaker
   * as two independent channels; it rejects with an Error whose message is
   * 'no_headset' (no bluetooth/wired headset connected) or 'unsupported_api'
   * (device/OS can't do per-channel routing — needs Android 12+) — callers should
   * fall back to `start()` with no args (single mode) on either rejection.
   */
  start(options?: { mode?: "single" | "dual" }): Promise<DeviceReport>;
  /** Tears everything down. */
  stop(): Promise<void>;
  /** Enqueue a base64-encoded PCM16 24kHz mono chunk for playback. `channel` defaults to 'main'. */
  playPcm(opts: { data: string; channel?: Channel }): Promise<void>;
  /** Barge-in: drop queued audio, flush the playback track. Omit `channel` to stop all channels. */
  stopPlayback(opts?: { channel?: Channel }): Promise<void>;
  /** Fires ~8x/sec with base64 PCM16 16kHz mic audio, tagged with its source channel. */
  addListener(
    eventName: "chunk",
    listenerFunc: (event: { data: string; channel: Channel }) => void
  ): Promise<PluginListenerHandle>;
  /** True when TTS starts, false ~300ms after that channel's playback queue drains. */
  addListener(
    eventName: "playbackState",
    listenerFunc: (event: { playing: boolean; channel: Channel }) => void
  ): Promise<PluginListenerHandle>;
  /** Fires ~1s after a dual start() with the real routed devices (routing can settle after start). */
  addListener(
    eventName: "routing",
    listenerFunc: (event: DeviceReport) => void
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
