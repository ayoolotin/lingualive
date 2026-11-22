/**
 * AudioWorklet processor source — compiled inline as a string and loaded via
 * a Blob URL to avoid external asset loading issues in Vite/production.
 *
 * Responsibilities:
 *  1. Capture Float32 mono audio from the browser microphone.
 *  2. Resample to 16,000 Hz using linear interpolation regardless of the AudioContext sample rate.
 *  3. Convert Float32 to signed 16-bit PCM in little-endian byte order.
 *  4. Batch samples into ~100 ms frames (1,600 samples at 16 kHz = 3,200 bytes).
 *  5. Never send frames shorter than 100 ms.
 *  6. Transfer binary ArrayBuffer to main thread for WebSocket transmission in real time.
 */
export const WORKLET_PROCESSOR_SOURCE = /* js */ `
class LinguaLiveProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    const { inputSampleRate = 44100, targetSampleRate = 16000 } = (options && options.processorOptions) || {}
    this._inputSampleRate = inputSampleRate
    this._targetSampleRate = targetSampleRate
    this._ratio = inputSampleRate / targetSampleRate
    this._targetFrameSize = Math.round(targetSampleRate * 0.1) // 1600 samples = 100ms at 16kHz
    this._buffer = new Float32Array(this._targetFrameSize * 4)
    this._bufferLen = 0
    this._inputCursor = 0
    this._lastInputSample = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channel = input[0]
    const inLen = channel.length

    // Linear interpolation resampling
    while (this._inputCursor < inLen) {
      const idx = Math.floor(this._inputCursor)
      const frac = this._inputCursor - idx
      const s0 = idx === 0 ? this._lastInputSample : channel[idx - 1]
      const s1 = channel[idx]
      const sample = s0 + frac * (s1 - s0)

      if (this._bufferLen < this._buffer.length) {
        this._buffer[this._bufferLen++] = sample
      }
      this._inputCursor += this._ratio
    }

    this._lastInputSample = channel[inLen - 1]
    this._inputCursor -= inLen

    // Emit frames only when we have at least 100 ms worth of samples
    while (this._bufferLen >= this._targetFrameSize) {
      const buffer = new ArrayBuffer(this._targetFrameSize * 2)
      const view = new DataView(buffer)
      for (let j = 0; j < this._targetFrameSize; j++) {
        const s = Math.max(-1, Math.min(1, this._buffer[j]))
        const val = s < 0 ? s * 0x8000 : s * 0x7fff
        view.setInt16(j * 2, val, true) // Explicit little-endian Int16 PCM
      }

      this._buffer.copyWithin(0, this._targetFrameSize, this._bufferLen)
      this._bufferLen -= this._targetFrameSize

      this.port.postMessage({ pcm: buffer }, [buffer])
    }

    return true
  }
}

registerProcessor('lingualive-processor', LinguaLiveProcessor)
`
