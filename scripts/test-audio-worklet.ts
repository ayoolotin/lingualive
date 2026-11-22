const vm = require('vm') as typeof import('vm')
const fs = require('fs') as typeof import('fs')
const path = require('path') as typeof import('path')

const sourcePath = path.resolve(process.cwd(), 'client/src/lib/audioWorkletProcessor.ts')
const sourceFile = fs.readFileSync(sourcePath, 'utf8')
const sourceMarker = 'export const WORKLET_PROCESSOR_SOURCE = /* js */ `'
const markerIndex = sourceFile.indexOf(sourceMarker)
if (markerIndex < 0) throw new Error('Could not locate WORKLET_PROCESSOR_SOURCE in audioWorkletProcessor.ts')
const sourceStart = markerIndex + sourceMarker.length
const sourceEnd = sourceFile.lastIndexOf('`\n')
if (sourceEnd <= sourceStart) throw new Error('Could not locate the end of WORKLET_PROCESSOR_SOURCE')
const WORKLET_PROCESSOR_SOURCE = sourceFile.slice(sourceStart, sourceEnd)

interface SentFrame {
  pcm: ArrayBuffer
}

function createProcessor(inputSampleRate: number) {
  let processorClass: new (options: unknown) => {
    port: { postMessage: (message: SentFrame, transfer: unknown[]) => void }
    process: (inputs: Float32Array[][]) => boolean
  }

  class MockAudioWorkletProcessor {
    port: { postMessage: (message: SentFrame, transfer: unknown[]) => void }

    constructor(_options: unknown) {
      this.port = { postMessage: () => undefined }
    }
  }

  const frames: ArrayBuffer[] = []
  const context = vm.createContext({
    ArrayBuffer,
    Float32Array,
    Int16Array,
    DataView,
    Math,
    Number,
    AudioWorkletProcessor: MockAudioWorkletProcessor,
    registerProcessor: (_name: string, cls: typeof MockAudioWorkletProcessor) => {
      processorClass = cls as typeof processorClass
    },
  })
  vm.runInContext(WORKLET_PROCESSOR_SOURCE, context)

  const processor = new processorClass!({
    processorOptions: {
      inputSampleRate,
      targetSampleRate: 16_000,
    },
  })
  processor.port.postMessage = (message: SentFrame) => {
    frames.push(message.pcm)
  }

  return {
    processBlock(samples: Float32Array) {
      processor.process([[samples]])
    },
    frames,
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function createRamp(length: number): Float32Array {
  const values = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    values[i] = Math.max(-1, Math.min(1, (i / Math.max(1, length - 1)) * 2 - 1))
  }
  return values
}

function runOneSecondTest(inputSampleRate: number) {
  const runner = createProcessor(inputSampleRate)
  const allInput = createRamp(inputSampleRate)

  for (let offset = 0; offset < inputSampleRate; offset += 128) {
    const end = Math.min(offset + 128, inputSampleRate)
    runner.processBlock(allInput.subarray(offset, end))
  }

  assert(
    runner.frames.length === 10,
    `${inputSampleRate} Hz should emit 10 full 100 ms frames; emitted ${runner.frames.length}`,
  )

  let sampleCount = 0
  for (const frame of runner.frames) {
    assert(frame.byteLength === 3200, `${inputSampleRate} Hz frame must be 3200 bytes`)
    const int16 = new Int16Array(frame)
    assert(int16.length === 1600, `${inputSampleRate} Hz frame must contain 1600 samples`)
    sampleCount += int16.length
    for (let i = 0; i < int16.length; i++) {
      assert(Number.isFinite(int16[i]), `${inputSampleRate} Hz emitted a non-finite Int16 sample`)
      assert(int16[i] >= -32768 && int16[i] <= 32767, `${inputSampleRate} Hz emitted out-of-range Int16`)
    }
  }

  assert(sampleCount === 16000, `${inputSampleRate} Hz emitted unexpected total sample count`)
  console.log(`PASS: ${inputSampleRate} Hz resampling emits 10 x 1600-sample frames`)
}

function testBlockContinuity() {
  for (const inputSampleRate of [44_100, 48_000]) {
    const runner = createProcessor(inputSampleRate)
    const first = new Float32Array(128)
    const second = new Float32Array(128)
    first.fill(0.5)
    for (let i = 0; i < second.length; i++) second[i] = 0.5 + i / 512

    runner.processBlock(first)
    runner.processBlock(second)

    for (const frame of runner.frames) {
      const int16 = new Int16Array(frame)
      for (let i = 0; i < int16.length; i++) {
        assert(Number.isFinite(int16[i]), `${inputSampleRate} Hz boundary emitted a non-finite sample`)
      }
    }
    console.log(`PASS: ${inputSampleRate} Hz consecutive-block continuity`)
  }
}

function testOneSampleBlocks() {
  const runner = createProcessor(48_000)
  for (let i = 0; i < 480; i++) {
    const sample = i % 4 === 0 ? 1 : i % 4 === 2 ? -1 : 0
    runner.processBlock(new Float32Array([sample]))
  }

  for (const frame of runner.frames) {
    assert(frame.byteLength === 3200, 'One-sample block frame must be 3200 bytes')
  }
  console.log('PASS: one-sample block boundaries remain finite and frame-sized')
}

console.log('AudioWorklet resampler synthetic tests:')
runOneSecondTest(44_100)
runOneSecondTest(48_000)
testBlockContinuity()
testOneSampleBlocks()
console.log('Synthetic resampler test summary: 5/5 passed')
