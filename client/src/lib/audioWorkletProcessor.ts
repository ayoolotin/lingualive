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
    this._targetFrameSize = Math.round(targetSampleRate * 0.1) // 1600 samples = 100 ms at 16 kHz
    this._buffer = new Float32Array(this._targetFrameSize)
    this._bufferLen = 0
    // Absolute position in the continuous input stream, measured in input samples.
    // This position is output-driven and is not reset or decremented at block boundaries.
    this._sourcePosition = 0
    this._blockStart = 0
    this._lastInputSample = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0]) return true

    const channel = input[0]
    const inLen = channel.length
    const blockEnd = this._blockStart + inLen

    // Each output sample is scheduled at a position in the continuous input timeline.
    // Interpolate between the previous input sample and the current block sample only
    // when the scheduled position crosses the beginning of a new input block.
    while (this._sourcePosition < blockEnd) {
      const relativePosition = this._sourcePosition - this._blockStart

      if (!Number.isFinite(relativePosition) || relativePosition < 0 || relativePosition >= inLen) {
        break
      }

      const idx = Math.floor(relativePosition)
      const frac = relativePosition - idx
      let sample

      if (!Number.isFinite(frac) || idx < 0 || idx >= inLen) {
        sample = 0
      } else if (frac === 0) {
        const exact = channel[idx]
        sample = Number.isFinite(exact) ? exact : 0
      } else if (idx === 0) {
        const previous = Number.isFinite(this._lastInputSample) ? this._lastInputSample : 0
        const current = Number.isFinite(channel[0]) ? channel[0] : 0
        sample = previous + frac * (current - previous)
      } else {
        const previous = Number.isFinite(channel[idx - 1]) ? channel[idx - 1] : 0
        const current = Number.isFinite(channel[idx]) ? channel[idx] : 0
        sample = previous + frac * (current - previous)
      }

      if (!Number.isFinite(sample)) sample = 0
      sample = Math.max(-1, Math.min(1, sample))

      if (this._bufferLen < this._buffer.length) {
        this._buffer[this._bufferLen++] = sample
      }
      this._sourcePosition += this._ratio

      // Emit frames only when we have at least 100 ms worth of samples.
      if (this._bufferLen >= this._targetFrameSize) {
        const buffer = new ArrayBuffer(this._targetFrameSize * 2)
        const view = new DataView(buffer)
        for (let j = 0; j < this._targetFrameSize; j++) {
          const s = Math.max(-1, Math.min(1, this._buffer[j]))
          const val = s < 0 ? s * 0x8000 : s * 0x7fff
          view.setInt16(j * 2, val, true)
        }

        this.port.postMessage({ pcm: buffer }, [buffer])
        this._bufferLen = 0
      }
    }

    this._lastInputSample = Number.isFinite(channel[inLen - 1]) ? channel[inLen - 1] : 0
    this._blockStart = blockEnd

    // Any partial frame is intentionally retained only until the next full 100 ms frame.
    // The Web Audio pipeline does not emit the short final remainder.
    if (this._bufferLen > 0) {
      // Keep the partial samples for the next block.
    }

    /*
     * Reaching this point does not emit a partial frame. It remains in _buffer
     * while _bufferLen is smaller than _targetFrameSize.
     */

    return true
  }
}

registerProcessor('lingualive-processor', LinguaLiveProcessor)
`
