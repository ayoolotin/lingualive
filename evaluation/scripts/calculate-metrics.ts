const fs = require('fs') as typeof import('fs')
const path = require('path') as typeof import('path')

export interface WerResult {
  substitutions: number
  deletions: number
  insertions: number
  referenceWordCount: number
  wer: number | null
}

export interface ResultRow {
  testId: string
  language: string
  provider: string
  runNumber: string
  reference: string
  hypothesis: string
  successStatus: string
  errorDetails: string
}

export function normaliseTranscript(transcript: string): string[] {
  const normalized = (transcript ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized ? normalized.split(' ') : []
}

export function calculateWer(reference: string, hypothesis: string): WerResult {
  const referenceWords = normaliseTranscript(reference)
  const hypothesisWords = normaliseTranscript(hypothesis)
  const referenceWordCount = referenceWords.length

  if (referenceWordCount === 0) {
    return {
      substitutions: 0,
      deletions: 0,
      insertions: 0,
      referenceWordCount: 0,
      wer: null,
    }
  }

  const rows = referenceWordCount + 1
  const columns = hypothesisWords.length + 1
  const distance = Array.from({ length: rows }, () =>
    Array<number>(columns).fill(0),
  )

  for (let i = 0; i < rows; i++) distance[i][0] = i
  for (let j = 0; j < columns; j++) distance[0][j] = j

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < columns; j++) {
      if (referenceWords[i - 1] === hypothesisWords[j - 1]) {
        distance[i][j] = distance[i - 1][j - 1]
      } else {
        distance[i][j] = 1 + Math.min(
          distance[i - 1][j],
          distance[i][j - 1],
          distance[i - 1][j - 1],
        )
      }
    }
  }

  let i = referenceWordCount
  let j = hypothesisWords.length
  let substitutions = 0
  let deletions = 0
  let insertions = 0

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && referenceWords[i - 1] === hypothesisWords[j - 1]) {
      i--
      j--
    } else if (
      i > 0 &&
      j > 0 &&
      distance[i][j] === distance[i - 1][j - 1] + 1
    ) {
      substitutions++
      i--
      j--
    } else if (i > 0 && distance[i][j] === distance[i - 1][j] + 1) {
      deletions++
      i--
    } else {
      insertions++
      j--
    }
  }

  return {
    substitutions,
    deletions,
    insertions,
    referenceWordCount,
    wer: (substitutions + deletions + insertions) / referenceWordCount,
  }
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        field += '"'
        i++
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      fields.push(field)
      field = ''
    } else {
      field += char
    }
  }
  fields.push(field)
  return fields
}

export function parseCsv(csv: string): ResultRow[] {
  const text = csv.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) return []

  const headers = parseCsvLine(lines[0]).map((header) => header.trim())
  const index = (name: string) => headers.findIndex(
    (header) => header.toLowerCase() === name.toLowerCase(),
  )

  const testIdIndex = index('Test ID')
  const languageIndex = index('Language')
  const providerIndex = index('Provider')
  const runIndex = index('Run number')
  const referenceIndex = index('Reference transcript')
  const hypothesisIndex = index('Hypothesis transcript')
  const statusIndex = index('Success/failure')
  const errorIndex = index('Error details')

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line)
    const get = (columnIndex: number) =>
      columnIndex >= 0 ? (fields[columnIndex] ?? '').trim() : ''

    return {
      testId: get(testIdIndex),
      language: get(languageIndex),
      provider: get(providerIndex),
      runNumber: get(runIndex),
      reference: get(referenceIndex),
      hypothesis: get(hypothesisIndex),
      successStatus: get(statusIndex),
      errorDetails: get(errorIndex),
    }
  })
}

interface Aggregate {
  substitutions: number
  deletions: number
  insertions: number
  referenceWordCount: number
  measuredRows: number
  missingRows: number
  failedRows: number
}

function emptyAggregate(): Aggregate {
  return {
    substitutions: 0,
    deletions: 0,
    insertions: 0,
    referenceWordCount: 0,
    measuredRows: 0,
    missingRows: 0,
    failedRows: 0,
  }
}

function addToAggregate(aggregate: Aggregate, result: WerResult) {
  aggregate.substitutions += result.substitutions
  aggregate.deletions += result.deletions
  aggregate.insertions += result.insertions
  aggregate.referenceWordCount += result.referenceWordCount
  aggregate.measuredRows++
}

function aggregateWer(aggregate: Aggregate): number | null {
  if (aggregate.referenceWordCount === 0) return null
  return (
    aggregate.substitutions +
    aggregate.deletions +
    aggregate.insertions
  ) / aggregate.referenceWordCount
}

export function runSyntheticTests(): number {
  const examples: Array<{ name: string; reference: string; hypothesis: string; expected: WerResult }> = [
    {
      name: 'identical transcription',
      reference: 'hola mundo',
      hypothesis: 'Hola, mundo!',
      expected: { substitutions: 0, deletions: 0, insertions: 0, referenceWordCount: 2, wer: 0 },
    },
    {
      name: 'substitution',
      reference: 'cat sat',
      hypothesis: 'cat sit',
      expected: { substitutions: 1, deletions: 0, insertions: 0, referenceWordCount: 2, wer: 0.5 },
    },
    {
      name: 'deletion',
      reference: 'a b c',
      hypothesis: 'a c',
      expected: { substitutions: 0, deletions: 1, insertions: 0, referenceWordCount: 3, wer: 1 / 3 },
    },
    {
      name: 'insertion',
      reference: 'a b',
      hypothesis: 'a extra b',
      expected: { substitutions: 0, deletions: 0, insertions: 1, referenceWordCount: 2, wer: 0.5 },
    },
  ]

  let failures = 0
  console.log('Synthetic metric tests (not real benchmark results):')
  for (const example of examples) {
    const actual = calculateWer(example.reference, example.hypothesis)
    const passed =
      actual.substitutions === example.expected.substitutions &&
      actual.deletions === example.expected.deletions &&
      actual.insertions === example.expected.insertions &&
      actual.referenceWordCount === example.expected.referenceWordCount &&
      Math.abs((actual.wer ?? -1) - (example.expected.wer ?? -1)) < 1e-12

    console.log(`${passed ? 'PASS' : 'FAIL'}: ${example.name}`)
    if (!passed) failures++
  }

  const missing = calculateWer('', 'unexpected')
  const missingPassed = missing.wer === null
  console.log(`${missingPassed ? 'PASS' : 'FAIL'}: empty reference remains unscored`)
  if (!missingPassed) failures++

  console.log(`Synthetic test summary: ${examples.length + 1 - failures}/${examples.length + 1} passed`)
  return failures > 0 ? 1 : 0
}

function formatPercent(value: number | null): string {
  return value === null ? 'MISSING' : `${(value * 100).toFixed(2)}%`
}

function main(): number {
  const args = process.argv.slice(2)
  if (args.includes('--test')) {
    return runSyntheticTests()
  }

  const inputArg = args.find((arg) => arg !== '--test')
  const repositoryRoot = process.cwd()
  const inputPath = path.resolve(
    repositoryRoot,
    inputArg ?? 'evaluation/templates/results-template.csv',
  )

  if (!fs.existsSync(inputPath)) {
    console.error(`Missing results CSV: ${inputPath}`)
    return 1
  }

  const rows = parseCsv(fs.readFileSync(inputPath, 'utf8'))
  const overall = emptyAggregate()
  const byLanguage = new Map<string, Aggregate>()
  let missingRows = 0

  console.log(`Provider results: ${inputPath}`)
  console.log(`Rows read: ${rows.length}`)

  for (const row of rows) {
    const status = row.successStatus.toLowerCase()
    const statusIsFailure = status === 'failure' || status === 'failed' || status === 'error'
    const statusIsSuccess = status === 'success' || status === 'succeeded' || status === 'pass'

    if (statusIsFailure) {
      overall.failedRows++
      const languageAggregate = byLanguage.get(row.language) ?? emptyAggregate()
      languageAggregate.failedRows++
      byLanguage.set(row.language, languageAggregate)
      console.log(`MISSING: ${row.testId || '(no test id)'} — provider failure: ${row.errorDetails || 'no details'}`)
      continue
    }

    if (!row.reference.trim() || !row.hypothesis.trim()) {
      missingRows++
      overall.missingRows++
      const languageAggregate = byLanguage.get(row.language) ?? emptyAggregate()
      languageAggregate.missingRows++
      byLanguage.set(row.language, languageAggregate)
      console.log(`MISSING: ${row.testId || '(no test id)'} — missing reference or hypothesis`)
      continue
    }

    if (!statusIsSuccess) {
      missingRows++
      overall.missingRows++
      const languageAggregate = byLanguage.get(row.language) ?? emptyAggregate()
      languageAggregate.missingRows++
      byLanguage.set(row.language, languageAggregate)
      console.log(`MISSING: ${row.testId || '(no test id)'} — Success/failure must be success or failure`)
      continue
    }

    const wer = calculateWer(row.reference, row.hypothesis)
    addToAggregate(overall, wer)
    const languageAggregate = byLanguage.get(row.language) ?? emptyAggregate()
    addToAggregate(languageAggregate, wer)
    byLanguage.set(row.language, languageAggregate)
  }

  console.log('\nAggregate WER:')
  console.log(`  Measured rows: ${overall.measuredRows}`)
  console.log(`  Failed rows: ${overall.failedRows}`)
  console.log(`  Missing rows: ${overall.missingRows}`)
  console.log(`  Reference words: ${overall.referenceWordCount}`)
  console.log(`  Substitutions: ${overall.substitutions}`)
  console.log(`  Deletions: ${overall.deletions}`)
  console.log(`  Insertions: ${overall.insertions}`)
  console.log(`  WER: ${formatPercent(aggregateWer(overall))}`)

  if (byLanguage.size > 0) {
    console.log('\nPer-language WER:')
    const languageNames = Array.from(byLanguage.keys()).sort()
    for (const language of languageNames) {
      const aggregate = byLanguage.get(language)!
      console.log(
        `  ${language || '(missing language)'}: ${formatPercent(aggregateWer(aggregate))} ` +
        `(measured=${aggregate.measuredRows}, failed=${aggregate.failedRows}, missing=${aggregate.missingRows})`,
      )
    }
  }

  if (missingRows > 0) {
    console.log('\nMissing results are reported and excluded from WER calculations.')
  }
  return 0
}

process.exitCode = main()
