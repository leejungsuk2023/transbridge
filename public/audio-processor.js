/**
 * AudioWorklet processor: captures PCM audio from microphone,
 * downsamples to 16kHz Int16, and sends chunks to main thread.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Target output sample rate (Gemini expects 16kHz)
    this._targetSampleRate = (options && options.processorOptions && options.processorOptions.targetSampleRate) || 16000;
    this._inputSampleRate = sampleRate; // AudioWorkletGlobalScope provides sampleRate
    this._bufferSize = 2048;
    this._buffer = new Float32Array(this._bufferSize);
    this._bytesWritten = 0;
    // Resampling state
    this._resampleRatio = this._targetSampleRate / this._inputSampleRate;
    this._resampleBuffer = [];
  }

  /**
   * Linear interpolation downsampler.
   * Takes a Float32Array at native rate, returns Float32Array at target rate.
   */
  _downsample(input) {
    if (this._inputSampleRate === this._targetSampleRate) {
      return input;
    }
    const outputLength = Math.round(input.length * this._resampleRatio);
    const output = new Float32Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i / this._resampleRatio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, input.length - 1);
      const fraction = srcIndex - srcIndexFloor;
      output[i] = input[srcIndexFloor] * (1 - fraction) + input[srcIndexCeil] * fraction;
    }
    return output;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Downsample to target rate if needed
    const samples = this._downsample(channelData);

    for (let i = 0; i < samples.length; i++) {
      this._buffer[this._bytesWritten++] = samples[i];

      if (this._bytesWritten >= this._bufferSize) {
        // Convert Float32 to Int16 PCM
        const int16 = new Int16Array(this._bufferSize);
        for (let j = 0; j < this._bufferSize; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]));
          int16[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        // Transfer buffer ownership to avoid copying
        this.port.postMessage({ pcmData: int16.buffer }, [int16.buffer]);
        this._buffer = new Float32Array(this._bufferSize);
        this._bytesWritten = 0;
      }
    }

    return true;
  }
}

registerProcessor('audio-processor', AudioProcessor);
