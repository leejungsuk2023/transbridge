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
  onOriginalText: (text: string) => void;    // Input transcription (what was said)
  onTranslatedText: (text: string) => void;  // Output transcription (translation)
  onAudio: (base64Audio: string) => void;    // Translated audio chunk
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
      // Send setup message with model config
      const setup = {
        setup: {
          model: `models/${this.config.model}`,
          generationConfig: {
            responseModalities: ['AUDIO', 'TEXT'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } },
            },
          },
          systemInstruction: {
            parts: [{ text: this.config.systemPrompt }],
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };
      this.ws!.send(JSON.stringify(setup));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string);

        // Setup complete
        if (msg.setupComplete) {
          this.callbacks.onStateChange('connected');
          return;
        }

        const sc = msg.serverContent;
        if (!sc) return;

        // Input transcription (original speech)
        if (sc.inputTranscription?.text) {
          this.callbacks.onOriginalText(sc.inputTranscription.text);
        }

        // Output transcription (translated text)
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

    this.ws.onerror = () => {
      this.callbacks.onError('WebSocket connection error');
      this.callbacks.onStateChange('disconnected');
    };

    this.ws.onclose = () => {
      this.callbacks.onStateChange('disconnected');
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
