# LinguaLive Speech Evaluation Protocol

## Objective

This framework establishes a fair, reproducible process for assessing whether AssemblyAI meets the requirements of a language-learning voice agent and comparing it with a customer's incumbent speech provider.

It does not run a provider comparison and does not claim measured AssemblyAI or incumbent performance.

## Why these utterances

LinguaLive's intended user speaks in English and asks how to express or understand something in another language. The learner does not need to speak the target phrase to use the tutor.

The pilot contains eight English requests covering:

- A clean short greeting.
- A contextual coffee-ordering question.
- A grammatical contextual question.
- An informal Italian request.
- A longer hotel question.
- A hesitant, multi-clause French request.
- A natural variation in Spanish.
- An Italian directions request with controlled background noise.

The complete manifest is [`dataset/manifest.json`](./dataset/manifest.json).

These eight recordings are an exploratory pilot. They are not statistically representative of accent, dialect, age, microphone, environment or provider population diversity. Use a larger, customer-defined corpus before drawing production conclusions.

## Recording protocol

Record each exact reference transcript in `dataset/manifest.json`. The current manifest intentionally has:

- `audio_filename: null`
- `speaker_id: null`
- `audio_duration_ms: null`
- `recording_status: "not_recorded"`

Do not replace these values or add benchmark data until real recordings exist.

Suggested setup:

1. Assign an anonymised speaker ID.
2. Read the exact wording naturally.
3. Preserve hesitation in EN-06 rather than rephrasing it.
4. Use one close microphone and documented room setup.
5. Use mono PCM or WAV where provider APIs permit; 16 kHz or 24 kHz can be used consistently.
6. Record EN-08 with a documented, controlled background-noise source and approximate level.
7. Retain the original lossless source file.
8. Manually listen to every recording and verify it matches the exact reference transcript.
9. Record the measured duration once and store it consistently.

Provider-specific resampling or encoding is not a reason to alter the source recording. If resampling is required, apply the same policy and record provider configuration for every run.

## Fair provider comparison

For each test and run:

1. Use the exact same source audio file.
2. Use the exact same manually verified reference transcript.
3. Use consistent language, encoding and sample-rate settings wherever provider APIs permit.
4. Record provider model, region, SDK/API version and relevant mode or turn-detection settings.
5. Repeat runs where practical and retain each run number.
6. Preserve failures, empty responses and timeouts.
7. Use the same latency clock basis and the same audio-stream start timestamp definition.
8. Do not silently exclude difficult or failed cases.

Document provider configuration outside the metric script. Do not hide configuration changes between runs.

## Metrics

### Word Error Rate

WER measures word-level recognition accuracy:

```text
WER = (substitutions + deletions + insertions) / reference word count
```

The metrics script normalises Unicode text, lowercases it, replaces punctuation with spaces and normalises whitespace. It uses word-level Levenshtein edit distance and reports:

- substitutions;
- deletions;
- insertions;
- reference word count;
- aggregate WER;
- per-language WER.

Aggregate WER is corpus-level: edits are summed and divided by summed reference words. It is not the average of per-test percentages.

An empty or missing hypothesis is not scored as perfect. Missing references, missing hypotheses and failed provider rows are reported separately and excluded from measured WER aggregates.

The script does not read an externally supplied WER column. It calculates WER from reference and hypothesis transcripts.

### First partial transcript latency

Start the timer when audio streaming begins. Stop it when the first partial transcript arrives.

Record both provider name and run number. This metric indicates perceived early responsiveness, but it does not measure the final turn.

### Final transcript latency

Start the timer at the same audio-stream start event. Stop it when the provider emits the documented final or confirmed transcript.

Use each provider's documented final-turn semantics consistently. Do not mix provider-final events with a provider-defined interim event.

### Real-time factor

```text
real-time factor = elapsed stream start-to-final time / audio duration
```

Use the measured and recorded audio duration for the same source file. Lower values indicate faster finalisation relative to recorded audio; the result remains dependent on the provider's exact final-event definition.

### Success and failure rate

Record success only for a usable completed transcription.

Count authentication failures, API failures, invalid responses, empty transcripts and timeouts as failures. Report both counts and percentages.

## Capturing streaming latency

Use a shared harness or runner for provider implementations:

1. Read the exact source file.
2. Record a monotonic stream-start timestamp.
3. Send audio at a consistent real-time pace or document that it was replayed offline.
4. Timestamp every partial result.
5. Timestamp the provider's final result.
6. Record the audio duration independently.
7. Save one row per provider/run in the results CSV.

Provider SDK buffering or audio pacing must be identical in intent and documented if provider APIs require different frame handling.

## Separating evaluation layers

STT accuracy and latency must not be used as a score for downstream quality.

Evaluate separately:

- **STT:** English recognition, WER, partial stability and final-turn latency.
- **LLM tutor:** target-language correctness, naturalness and pedagogical usefulness.
- **TTS:** target-language pronunciation, intelligibility and naturalness.
- **Voice-agent integration:** turn-taking, recovery and conversational reliability.

The customer should judge downstream quality with separate transcripts and test protocols.

## Acceptance thresholds

Customer-specific thresholds must be agreed before provider results are reviewed.

Examples of threshold categories include WER, latency percentiles, real-time factor and minimum success rate. No values are defined here because each customer use case has different accuracy and responsiveness requirements.

Do not interpret missing thresholds or missing benchmark data as AssemblyAI performance.

## Results format

Use [`templates/results-template.csv`](./templates/results-template.csv). The columns cover:

- test ID;
- language;
- provider;
- run number;
- reference transcript;
- hypothesis transcript;
- WER;
- first partial latency;
- final transcript latency;
- audio duration;
- real-time factor;
- success/failure;
- error details;
- notes.

The metrics script calculates WER rather than trusting the CSV WER column.

## Running the metrics script

From the repository root, run synthetic metric tests:

```bash
npm run eval:test
```

The template run:

```bash
npm run eval:metrics
```

For a provider results file:

```bash
npm run eval:metrics -- evaluation/results/provider-results.csv
```

The template and `evaluation/results/` contain no completed recordings or benchmark runs. A template run reports missing WER rather than fabricated provider results.
