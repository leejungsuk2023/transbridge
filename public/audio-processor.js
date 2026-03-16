/**
 * AudioWorklet processor for capturing microphone audio.
 * Matches AudioProcessingWorklet from Google's reference implementation exactly.
 * Ref: https://github.com/google-gemini/live-api-web-console/blob/main/src/lib/worklets/audio-processing.ts
 *
 * Buffers 2048 Int16 samples (~8x/sec at 16kHz) and posts them to the main thread.
 * Message format: { event: "chunk", data: { int16arrayBuffer: ArrayBuffer } }
 *
 * IMPORTANT: AudioContext must be created at 16000 Hz so no downsampling is needed.
 */
class AudioProcessingWorklet extends AudioWorkletProcessor {
  // Send and clear buffer every 2048 samples.
  // At 16kHz this fires about 8 times per second.
  buffer = new Int16Array(2048);

  // Current write index
  bufferWriteIndex = 0;

  constructor() {
    super();
    this.hasAudio = false;
  }

  /**
   * @param inputs Float32Array[][] — [input#][channel#][sample#]
   *               inputs[0][0] is the first channel of the first input
   */
  process(inputs) {
    if (inputs[0].length) {
      const channel0 = inputs[0][0];
      this.processChunk(channel0);
    }
    return true;
  }

  sendAndClearBuffer() {
    this.port.postMessage({
      event: "chunk",
      data: {
        int16arrayBuffer: this.buffer.slice(0, this.bufferWriteIndex).buffer,
      },
    });
    this.bufferWriteIndex = 0;
  }

  processChunk(float32Array) {
    const l = float32Array.length;

    for (let i = 0; i < l; i++) {
      // Convert float32 [-1, 1] to int16 [-32768, 32767]
      const int16Value = float32Array[i] * 32768;
      this.buffer[this.bufferWriteIndex++] = int16Value;
      if (this.bufferWriteIndex >= this.buffer.length) {
        this.sendAndClearBuffer();
      }
    }

    if (this.bufferWriteIndex >= this.buffer.length) {
      this.sendAndClearBuffer();
    }
  }
}

registerProcessor("audio-processor", AudioProcessingWorklet);
