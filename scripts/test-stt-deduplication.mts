import { FinalTurnDeduplicator } from '../client/src/lib/finalTurnDeduplicator.ts'
import { SttSessionOwnership } from '../client/src/lib/sttSessionOwnership.ts'

let passed = 0
let total = 0

function assert(name: string, condition: boolean): void {
  total++
  if (condition) {
    passed++
    console.log(`PASS: ${name}`)
  } else {
    console.error(`FAIL: ${name}`)
  }
}

console.log('STT final Turn deduplicator synthetic tests:')

const duplicateEvent = new FinalTurnDeduplicator()
assert(
  'Same final event received twice commits once',
  duplicateEvent.shouldCommit({ turn_order: 0, end_of_turn: true }) &&
  !duplicateEvent.shouldCommit({ turn_order: 0, end_of_turn: true }),
)

const repeatedText = new FinalTurnDeduplicator()
assert(
  'Two distinct identical-text turns both commit',
  repeatedText.shouldCommit({ turn_order: 0, end_of_turn: true }) &&
  repeatedText.shouldCommit({ turn_order: 1, end_of_turn: true }),
)

const partials = new FinalTurnDeduplicator()
assert(
  'Multiple partial events do not commit',
  !partials.shouldCommit({ turn_order: 0, end_of_turn: false }) &&
  !partials.shouldCommit({ turn_order: 0, end_of_turn: false }) &&
  partials.shouldCommit({ turn_order: 0, end_of_turn: true }),
)

const outOfOrder = new FinalTurnDeduplicator()
assert(
  'Out-of-order and repeated turn_order events do not duplicate',
  outOfOrder.shouldCommit({ turn_order: 2, end_of_turn: true }) &&
  outOfOrder.shouldCommit({ turn_order: 1, end_of_turn: true }) &&
  !outOfOrder.shouldCommit({ turn_order: 2, end_of_turn: true }) &&
  outOfOrder.shouldCommit({ turn_order: 3, end_of_turn: true }),
)

const missingIdentity = new FinalTurnDeduplicator()
assert(
  'Missing turn_order does not permanently suppress turns',
  missingIdentity.shouldCommit({ end_of_turn: true }) &&
  missingIdentity.shouldCommit({ end_of_turn: true }),
)

const newSession = new FinalTurnDeduplicator()
assert(
  'New session accepts a turn_order from the previous session',
  newSession.shouldCommit({ turn_order: 0, end_of_turn: true }) &&
  !newSession.shouldCommit({ turn_order: 0, end_of_turn: true }) &&
  (newSession.reset(), newSession.shouldCommit({ turn_order: 0, end_of_turn: true })),
)

const ownership = new SttSessionOwnership()
const firstSession = ownership.beginSession()
const secondSession = ownership.beginSession()
assert(
  'Old session callback cannot affect new session',
  ownership.isActive(secondSession) &&
  !ownership.isActive(firstSession),
)

ownership.invalidateActiveSession()
assert(
  'Invalidating an active session prevents stale callbacks',
  !ownership.isActive(secondSession),
)

function runOwnedCleanup(
  ownership: SttSessionOwnership,
  callbackSessionId: number,
  cleanup: () => void,
): boolean {
  if (!ownership.isActive(callbackSessionId)) return false
  cleanup()
  return true
}

const lifecycle = new SttSessionOwnership()
const oldLifecycleSession = lifecycle.beginSession()
lifecycle.beginSession()
let newSessionStatus = 'listening'
const oldCloseAffected = runOwnedCleanup(lifecycle, oldLifecycleSession, () => {
  newSessionStatus = 'disconnected'
})
assert(
  'Old WebSocket close cannot affect the new session',
  !oldCloseAffected && newSessionStatus === 'listening',
)

const errorLifecycle = new SttSessionOwnership()
const oldErrorSession = errorLifecycle.beginSession()
errorLifecycle.beginSession()
let newSessionStatusAfterError = 'listening'
const oldErrorAffected = runOwnedCleanup(errorLifecycle, oldErrorSession, () => {
  newSessionStatusAfterError = 'error'
})
assert(
  'Old WebSocket error cannot clean up the new session',
  !oldErrorAffected && newSessionStatusAfterError === 'listening',
)

const activeLifecycle = new SttSessionOwnership()
const activeLifecycleSession = activeLifecycle.beginSession()
let activeCleanupRan = false
const activeCleanupAffected = runOwnedCleanup(
  activeLifecycle,
  activeLifecycleSession,
  () => {
    activeCleanupRan = true
  },
)
assert(
  'Active session cleanup still works',
  activeCleanupAffected && activeCleanupRan,
)

console.log(`Synthetic STT deduplication test summary: ${passed}/${total} passed`)
if (passed !== total) process.exit(1)
