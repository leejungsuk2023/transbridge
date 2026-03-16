/**
 * Client-side Gemini Live API helper.
 * Connects to Gemini Live via WebSocket for real-time audio translation.
 * Used in Full-Duplex mode — no PTT needed.
 */

export interface GeminiLiveConfig {
  apiKey?: string;
  ephemeralToken?: string;
  model: string;
  systemPrompt: string;
  wsUrl: string;
}

export interface GeminiLiveCallbacks {
  onOriginalText: (text: string) => void;
  onTranslatedText: (text: string) => void;
  onAudio: (base64Audio: string) => void;
  onError: (error: string) => void;
  onStateChange: (state: 'connecting' | 'connected' | 'disconnected') => void;
}

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private callbacks: GeminiLiveCallbacks;
  private config: GeminiLiveConfig;

  constructor(config: GeminiLiveConfig, callbacks: GeminiLiveCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  async connect(): Promise<void> {
    this.callbacks.onStateChange('connecting');

    const authParam = this.config.ephemeralToken
      ? `bearer_token=${this.config.ephemeralToken}`
      : `key=${this.config.apiKey}`;

    const wsUrl = `${this.config.wsUrl}?${authParam}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // Step 1: Try absolute minimum setup first
      const setup = {
        setup: {
          model: `models/${this.config.model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
          },
          systemInstruction: {
            parts: [{ text: 'You are a Korean to Thai medical interpreter. Listen to Korean speech and respond with Thai translation. Translate only, no commentary.' }],
          },
        },
      };
      this.ws!.send(JSON.stringify(setup));
      this.callbacks.onError(`setup 전송 완료, 응답 대기중...`);
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        // Debug: show what we receive
        const keys = Object.keys(msg);
        this.callbacks.onError(`수신: ${keys.join(',')}`);

        // Setup complete
        if (msg.setupComplete !== undefined) {
          this.callbacks.onStateChange('connected');
          return;
        }

        // Error from server
        if (msg.error) {
          this.callbacks.onError(`Gemini 에러: ${msg.error.message || JSON.stringify(msg.error)}`);
          return;
        }

        const sc = msg.serverContent;
        if (!sc) return;

        // Input transcription
        if (sc.inputTranscription?.text) {
          this.callbacks.onOriginalText(sc.inputTranscription.text);
        }

        // Output transcription
        if (sc.outputTranscription?.text) {
          this.callbacks.onTranslatedText(sc.outputTranscription.text);
        }

        // Audio output
        if (sc.modelTurn?.parts) {
          for (const part of sc.modelTurn.parts) {
            if (part.inlineData?.mimeType?.startsWith('audio/')) {
              this.callbacks.onAudio(part.inlineData.data);
            }
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.ws.onerror = (e) => {
      this.callbacks.onError(`WS error: ${(e as ErrorEvent).message || 'unknown'}`);
      this.callbacks.onStateChange('disconnected');
    };

    this.ws.onclose = (e) => {
      this.callbacks.onError(`WS close: code=${e.code} reason=${e.reason || 'none'}`);
      if (e.code !== 1000) {
        this.callbacks.onStateChange('disconnected');
      }
    };
  }

  sendAudio(base64PcmChunk: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        realtimeInput: {
          mediaChunks: [{
            mimeType: 'audio/pcm;rate=16000',
            data: base64PcmChunk,
          }],
        },
      }));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
