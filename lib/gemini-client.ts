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

    // Ephemeral tokens use access_token=; direct API keys use key=
    const authParam = this.config.ephemeralToken
      ? `access_token=${this.config.ephemeralToken}`
      : `key=${this.config.apiKey}`;

    const wsUrl = `${this.config.wsUrl}?${authParam}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      // BidiGenerateContent setup: top-level key is "setup", responseModalities
      // goes directly in setup (not nested under generationConfig).
      // inputAudioTranscription must be enabled for the model to process audio input.
      const setupMsg = {
        setup: {
          model: `models/${this.config.model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
          },
          systemInstruction: {
            parts: [{ text: this.config.systemPrompt }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };
      this.ws!.send(JSON.stringify(setupMsg));
      this.callbacks.onError(`setup 전송 완료, 응답 대기중...`);
    };

    this.ws.onmessage = (event) => {
      // Server may send Blob (binary) or string; normalize to text first
      const parseMessage = (text: string) => {
        try {
          const msg = JSON.parse(text);

          // Debug: show what we receive
          const keys = Object.keys(msg);
          this.callbacks.onError(`수신: ${keys.join(',')}`);

          // Setup complete — value is an empty object {}
          if ('setupComplete' in msg) {
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

      if (event.data instanceof Blob) {
        event.data.text().then(parseMessage);
      } else {
        parseMessage(event.data as string);
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
      // Use audio field (mediaChunks is deprecated)
      this.ws.send(JSON.stringify({
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64PcmChunk,
          },
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
