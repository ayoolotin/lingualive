import { useRef, useCallback } from 'react'
import { WORKLET_PROCESSOR_SOURCE } from './audioWorkletProcessor'

const TARGET_SAMPLE_RATE = 16_000

export type MicError =
  | 'permission-denied'
  | 'not-found'
  | 'not-supported'
  | 'unknown'

export interface UseMicrophoneReturn {
  /**
   * Request microphone permission from the user.
   * Resolves to a live MediaStream, or throws a MicError string.
   */
  requestStream: () => Promise<MediaStream>
  /**
   * Initialise the AudioContext and AudioWorklet using an active MediaStream,
   * downsample to 16 kHz, and invoke onFrame for each ~100 ms PCM chunk.
   */
  startProcessing: (stream: MediaStream, onFrame: (pcm: ArrayBuffer) => void) => Promise<void>
  /**
   * Immediately stop audio streaming, close AudioContext, disconnect worklet,
   * and stop all microphone MediaStream tracks.
   */
  stop: () => void
}

export function useMicrophone(): UseMicrophoneReturn {
  const streamRef = useRef<MediaStream | null>(null)
  const contextRef = useRef<AudioContext | null>(null)
  const workletNodeRef = useRef<AudioWorkletNode | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)

  const stop = useCallback(() => {
    // 1. Disconnect and release worklet
    if (workletNodeRef.current) {
      workletNodeRef.current.port.onmessage = null
      workletNodeRef.current.disconnect()
      workletNodeRef.current = null
    }

    // 2. Disconnect source node
    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }

    // 3. Close AudioContext
    if (contextRef.current) {
      if (contextRef.current.state !== 'closed') {
        contextRef.current.close().catch(() => {/* ignore */})
      }
      contextRef.current = null
    }

    // 4. Stop all microphone MediaStream tracks to release hardware
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop()
        } catch {
          // ignore
        }
      })
      streamRef.current = null
    }
  }, [])

  const requestStream = useCallback(async (): Promise<MediaStream> => {
    // Check browser support
    if (
      typeof window === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof AudioWorkletNode === 'undefined'
    ) {
      throw 'not-supported' as MicError
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      })
      streamRef.current = stream
      return stream
    } catch (err) {
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          throw 'permission-denied' as MicError
        }
        if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          throw 'not-found' as MicError
        }
      }
      throw 'unknown' as MicError
    }
  }, [])

  const startProcessing = useCallback(
    async (stream: MediaStream, onFrame: (pcm: ArrayBuffer) => void) => {
      // Create AudioContext
      const context = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      contextRef.current = context

      // Register worklet processor via Blob URL
      const blob = new Blob([WORKLET_PROCESSOR_SOURCE], { type: 'application/javascript' })
      const blobUrl = URL.createObjectURL(blob)
      try {
        await context.audioWorklet.addModule(blobUrl)
      } finally {
        URL.revokeObjectURL(blobUrl)
      }

      // Create AudioWorkletNode with native sample rate info for resampling
      const workletNode = new AudioWorkletNode(context, 'lingualive-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 0,
        processorOptions: {
          inputSampleRate: context.sampleRate,
          targetSampleRate: TARGET_SAMPLE_RATE,
        },
      })
      workletNodeRef.current = workletNode

      // Forward 100 ms PCM ArrayBuffers to callback
      workletNode.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer }>) => {
        if (event.data?.pcm) {
          onFrame(event.data.pcm)
        }
      }

      // Connect microphone stream into the worklet
      const source = context.createMediaStreamSource(stream)
      sourceRef.current = source
      source.connect(workletNode)

      // Ensure AudioContext is running
      if (context.state === 'suspended') {
        await context.resume()
      }
    },
    [],
  )

  return { requestStream, startProcessing, stop }
}
