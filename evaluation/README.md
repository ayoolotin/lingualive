# LinguaLive Customer Speech Evaluation Protocol

## Objective

Determine whether AssemblyAI meets the customer's requirements for a real-time voice-powered language-learning product and provide a fair comparison against the customer's incumbent speech provider.

This framework is a foundation for evaluation. It does not run live provider comparisons and makes no claim about AssemblyAI versus an incumbent.

## Why English input is representative

In LinguaLive, the learner initially speaks English and asks for guidance in Spanish, French, German or Italian. The learner is not asked to pronounce the target-language phrase before the tutor response. These eight utterances therefore exercise the intended customer use case: English voice input followed by target-language teaching content.

The dataset is an exploratory pilot, not statistically representative evidence. Eight samples are too small to estimate population-level provider performance across accents, speakers, environments or all supported target-language contexts. Expand the recorded corpus and agree on sampling rules before making a customer decision.

## Scope separation

Evaluate each layer separately:

- **STT:** recognition of the user's English request.
- **LLM tutor:** correctness and usefulness of the generated target-language explanation and phrase.
- **TTS:** pronunciation quality and intelligibility of the spoken target-language phrase.
- **Voice-agent UX:** turn-taking, latency, recovery and usability.

Do not infer LLM or TTS quality from STT WER.

## Recording protocol

Record all eight files using the exact wording in [dataset/manifest.json](./dataset/manifest.json). Suggested file names are `EN-01.wav` through `EN-08.wav`, stored under [dataset/audio](./dataset/audio/).

Before recording:

1. Assign a speaker ID and record whether consent and anonymisation are complete.
2. Use a consistent close microphone, room, encoding and sample rate for the corpus wherever provider APIs permit.
3. Use the listed wording exactly. Preserve deliberate hesitation and pauses in EN-06.
4. Record EN-08 with a controlled, documented background-noise source and approximate level.
5. Keep the speaker, microphone, distance and environment consistent except for the condition being tested.
6. Manually review and verify every reference transcript. No reference is considered complete until the file has been listened to and checked.
7. Set `audio_filename`, `speaker_id`, `audio_duration_ms` and `recording_status` only after real files exist. Until then, status remains `not_recorded`.

Recommended exploratory input:

- 16 kHz or 24 kHz mono WAV/PCM, depending on provider support;
- a common source file rather than provider-specific conversions;
- lossless source audio retained without normalisation or noise removal;
- provider-permitted resampling and encoding documented separately.

Do not add or claim recordings that have not been supplied.

## Identical audio and provider comparison

Give every provider the exact same source file for every test. Do not re-record each provider, edit wording, or choose a provider-specific audio transformation.

For each provider and run, document:

- model name and region;
- language/input configuration;
- encoding and sample rate;
- SDK/API version;
- provider-specific connection settings;
- timestamps and run number;
- failures or timeouts.

Run each test more than once where practical. Preserve every run in the CSV, including failures. Never silently exclude a timeout or unusable response.

## Fairness and reproducibility

1. Use the same verified reference transcript for every provider.
2. Keep recording and encoding conditions constant wherever the APIs permit.
3. Run in the same network and application region where practical.
4. Start latency clocks at the same audio-stream start event.
5. Record provider configuration and API versions.
6. Separate measured results from assumptions and acceptance targets.
7. Customer numeric thresholds must be agreed before reviewing provider results.

## Metrics

### Word Error Rate (WER)

WER is:

```
WER = (substitutions + deletions + insertions) / reference word count
```

The metrics script normalises text with Unicode normalisation, lowercase conversion, punctuation replacement, and whitespace normalisation. It uses word-level Levenshtein edit distance and reports substitutions, deletions and insertions.

Missing or failed hypotheses are marked missing rather than converted into successful zero-error runs.

### First partial transcript latency

Measure the elapsed milliseconds from a consistent audio-stream start timestamp to the arrival of the first partial transcript. Lower latency indicates earlier perceived responsiveness.

### Final transcript latency

Measure the elapsed milliseconds from the same audio-stream start timestamp to the provider's documented final/confirmed transcript result. It determines how quickly the user's English request can reach the tutor.

### Real-time factor

Calculate:

```
real-time factor = elapsed stream start-to-final time / audio duration
```

Use the recorded audio duration consistently for every provider. A value below 1.0 means finalisation was faster than the source duration, subject to the provider event definition.

### Reliability

Report success/failure rate, timeouts, empty transcripts and API errors separately. A provider with low WER but frequent disconnections or empty results is not suitable for the voice agent.

### Noise robustness

Compare EN-08 and the clean samples under the exact same noise condition and audio file. Do not infer noise robustness from provider results with different source files or edited recordings.

## Results format

Use [templates/results-template.csv](./templates/results-template.csv). Each row should contain the test ID, language, provider, run number, reference and hypothesis transcripts, WER, first partial latency, final latency, audio duration, real-time factor, success/failure, error details and notes.

The metrics script:

- reads the provider CSV;
- calculates normalised WER with Levenshtein edit distance;
- aggregates substitutions, deletions and insertions;
- reports aggregate and per-language WER; and
- marks missing/failed rows without treating them as perfect scores.

## Separate qualitative evaluation

Review at minimum:

- clean and longer English utterance recognition;
- contextual and informal request recognition;
- hesitation handling;
- natural variation and contractions;
- controlled-noise robustness;
- partial transcript stability;
- provider reconnection and timeout reliability;
- SDK/API integration complexity;
- conversational turn-taking suitability;
- target-language tutor translation quality; and
- target-language TTS intelligibility and pronunciation.

Target-language translation quality and TTS pronunciation require separate human or specialist evaluation. STT WER should not be used as their score.

## Acceptance criteria

The customer must agree on numeric thresholds for WER, latency percentiles, real-time factor and success rate before provider results are reviewed. This repository intentionally defines no claimed thresholds and makes no performance claim.

## Synthetic metric tests

From the repository root:

```bash
npm run eval:test
```

These tests are synthetic and are not real benchmark results.

## Calculate provider metrics

Place completed provider results at `evaluation/results/provider-results.csv`, then run:

```bash
npm run eval:metrics -- evaluation/results/provider-results.csv
```

Without a provider file, the template command is a validation-only run:

```bash
npm run eval:metrics
```
