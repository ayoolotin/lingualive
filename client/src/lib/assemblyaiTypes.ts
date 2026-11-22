/**
 * AssemblyAI Streaming v3 WebSocket event types.
 * https://www.assemblyai.com/docs/speech-to-text/streaming
 */

export interface AaiBeginEvent {
  type: 'Begin'
  id: string
  expires_at: number
}

export interface AaiSpeechStartedEvent {
  type: 'SpeechStarted'
  audio_start_ms: number
}

export interface AaiTurnEvent {
  type: 'Turn'
  turn_order: number
  turn_is_formatted: boolean
  end_of_turn: boolean
  transcript: string
  words: Array<{
    word: string
    start: number
    end: number
    confidence: number
  }>
  // Formatting metadata – not consumed yet
  formatted_transcript?: string
}

export interface AaiTerminationEvent {
  type: 'Termination'
  audio_duration_seconds: number
  session_duration_seconds: number
}

export interface AaiErrorEvent {
  type: 'Error'
  error: string
}

export type AaiEvent =
  | AaiBeginEvent
  | AaiSpeechStartedEvent
  | AaiTurnEvent
  | AaiTerminationEvent
  | AaiErrorEvent

/** Message we send to terminate the session cleanly */
export interface AaiTerminateMessage {
  type: 'Terminate'
}
