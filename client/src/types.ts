/** Supported target languages */
export type Language = 'es' | 'fr' | 'de' | 'it'

export interface LanguageOption {
  code: Language
  label: string
  flag: string
  nativeName: string
}

/**
 * Possible states of the tutor session.
 * Maps directly to the AssemblyAI session lifecycle.
 */
export type SessionStatus =
  | 'disconnected'
  | 'connecting'   // fetching token + opening WebSocket
  | 'listening'    // WebSocket open, streaming audio
  | 'processing'   // audio sent, waiting for final turn
  | 'error'

/** A breakdown item for word-by-word explanation */
export interface TutorBreakdownItem {
  term: string
  meaning: string
}

/** Structured language-learning response from the AI tutor */
export interface TutorResponseData {
  phrase: string
  meaning: string
  breakdown: TutorBreakdownItem[]
  pronunciation: string
  usageTip: string
}

/** A full user-tutor conversation exchange */
export interface ConversationExchange {
  id: string
  userTranscript: string
  timestamp: Date
  targetLanguage: Language
  tutorResponse?: TutorResponseData
  isLoading?: boolean
  error?: string
}

/** Playback state for TTS audio */
export type TtsPlaybackState = 'idle' | 'loading' | 'playing' | 'error'

/** Latency and duration evaluation metrics for TTS */
export interface TtsTimingMetrics {
  requestInitiatedMs: number
  firstAudioReceivedMs?: number
  firstAudioPlayedMs?: number
  playbackCompletedMs?: number
  timeToFirstAudioMs?: number
  totalPlaybackTimeMs?: number
}

/** A single turn in the conversation (legacy compatibility) */
export interface ConversationTurn {
  id: string
  transcript: string
  tutorResponse: string
  timestamp: Date
}
