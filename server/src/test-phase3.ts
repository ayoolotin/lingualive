import {
  validateTargetLanguage,
  validateMessages,
  parseTutorResponse,
} from './services/llmGateway'

let passed = 0
let total = 0

function assert(name: string, condition: boolean) {
  total++
  if (condition) {
    passed++
    console.log(`PASS: ${name}`)
  } else {
    console.error(`FAIL: ${name}`)
  }
}

console.log('--- 1. Target Language Validation ---')
try { validateTargetLanguage('Spanish'); assert('Valid Spanish', true) } catch { assert('Valid Spanish', false) }
try { validateTargetLanguage('french '); assert('Valid French (case/whitespace insensitive)', true) } catch { assert('Valid French', false) }
try { validateTargetLanguage('German'); assert('Valid German', true) } catch { assert('Valid German', false) }
try { validateTargetLanguage('italian'); assert('Valid Italian', true) } catch { assert('Valid Italian', false) }
try { validateTargetLanguage('Russian'); assert('Reject unsupported language', false) } catch { assert('Reject unsupported language', true) }
try { validateTargetLanguage(123); assert('Reject non-string language', false) } catch { assert('Reject non-string language', true) }

console.log('--- 2. Message Validation ---')
try { validateMessages([{ role: 'user', content: 'Hello' }]); assert('Valid user message', true) } catch { assert('Valid user message', false) }
try { validateMessages([]); assert('Reject empty array', false) } catch { assert('Reject empty array', true) }
try { validateMessages([{ role: 'system' as unknown as 'user', content: 'You are an AI' }]); assert('Reject system role', false) } catch { assert('Reject system role', true) }
try { validateMessages([{ role: 'user', content: '   ' }]); assert('Reject whitespace-only content', false) } catch { assert('Reject whitespace-only content', true) }
try { validateMessages([{ role: 'user', content: 'a'.repeat(1500) }]); assert('Reject content > 1000 chars', false) } catch { assert('Reject content > 1000 chars', true) }
try {
  validateMessages([
    { role: 'user', content: 'Hi' },
    { role: 'assistant', content: 'Hello' },
  ])
  assert('Reject messages ending with assistant role', false)
} catch {
  assert('Reject messages ending with assistant role', true)
}

// Test message capping at 10 messages
const longHistory = Array.from({ length: 15 }, (_, i) => ({
  role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
  content: `Message ${i}`,
}))
// Ensure last is user
if (longHistory[longHistory.length - 1].role !== 'user') {
  longHistory.push({ role: 'user', content: 'Final user question' })
}
const capped = validateMessages(longHistory)
assert('Capped to at most 10 messages', capped.length <= 10 && capped[capped.length - 1].role === 'user')

console.log('--- 3. Response Parsing & Fallbacks ---')
const sample = {
  phrase: 'Quisiera un café con leche.',
  meaning: 'I would like a coffee with milk.',
  breakdown: [
    { term: 'Quisiera', meaning: 'I would like' },
    { term: 'un café', meaning: 'a coffee' },
  ],
  pronunciation: 'kee-see-EH-rah oon kah-FEH',
  usageTip: 'Polite ordering expression.',
}

const parsed1 = parseTutorResponse(JSON.stringify(sample))
assert('Parse valid JSON phrase', parsed1.phrase === sample.phrase)
assert('Parse valid JSON meaning', parsed1.meaning === sample.meaning)
assert('Parse breakdown items', parsed1.breakdown.length === 2 && parsed1.breakdown[0].term === 'Quisiera')

const markdownWrapped = '```json\n' + JSON.stringify(sample) + '\n```'
const parsed2 = parseTutorResponse(markdownWrapped)
assert('Parse markdown-wrapped JSON', parsed2.phrase === sample.phrase)

const malformed = 'Not valid JSON at all'
const parsed3 = parseTutorResponse(malformed)
assert('Handle malformed JSON without throwing', typeof parsed3.phrase === 'string' && Array.isArray(parsed3.breakdown))

console.log(`\nTEST RESULTS: ${passed}/${total} checks passed.`)
if (passed !== total) {
  process.exit(1)
}
