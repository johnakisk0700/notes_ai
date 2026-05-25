/**
 * This AudioWorkletProcessor captures raw audio, downsamples it to 16kHz,
 * converts it to 16-bit PCM format, and sends it to the main thread.
 */
class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.inputSampleRate = sampleRate; // `sampleRate` is a global variable in the worklet scope
    this.outputSampleRate = 16000; // OpenAI requires 16kHz
    this.resampleRatio = this.inputSampleRate / this.outputSampleRate;
    // console.log('[WORKLET] Processor created. Sample rate:', this.inputSampleRate);
  }

  /**
   * Converts a Float32Array of audio samples to a 16-bit PCM Int16Array.
   * @param {Float32Array} buffer The audio samples from -1.0 to 1.0.
   * @returns {Int16
   */
  float32ToInt16(buffer) {
    let l = buffer.length;
    const buf = new Int16Array(l);
    while (l--) {
      // Clamp the value between -1 and 1 before converting
      const s = Math.max(-1, Math.min(1, buffer[l]));
      // Convert to 16-bit integer
      buf[l] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return buf;
  }

  process(inputs) {
    // Use the first input and first channel
    const inputData = inputs[0][0];

    if (!inputData) {
      return true; // Keep processor alive
    }
    // console.log('[WORKLET] Processing audio chunk:', { inputSamples: inputData.length });

    // Downsample using linear interpolation for better audio quality.
    const numSamples = Math.floor(inputData.length / this.resampleRatio);
    const downsampledData = new Float32Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      const inputIndex = i * this.resampleRatio;
      const lowerIndex = Math.floor(inputIndex);
      const upperIndex = lowerIndex + 1;
      const indexFraction = inputIndex - lowerIndex;

      if (upperIndex < inputData.length) {
        const lowerValue = inputData[lowerIndex];
        const upperValue = inputData[upperIndex];
        downsampledData[i] = lowerValue + (upperValue - lowerValue) * indexFraction;
      } else {
        // For the last sample, just use the value at the lower index
        downsampledData[i] = inputData[lowerIndex];
      }
    }

    if (downsampledData.length > 0) {
      const pcm16Data = this.float32ToInt16(downsampledData);
      // Post the underlying ArrayBuffer to the main thread.
      // The second argument [pcm16Data.buffer] is a list of transferable objects,
      // which avoids copying data for better performance.
      // console.log('[WORKLET] → Posting downsampled PCM data to main thread:', { outputBytes: pcm16Data.buffer.byteLength });
      this.port.postMessage(pcm16Data.buffer, [pcm16Data.buffer]);
    }

    return true; // Indicate that the processor should remain active
  }
}

registerProcessor('audio-processor', AudioProcessor);
