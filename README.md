# LinguaLive

> Real-time AI language tutor — speak naturally and get instant guidance in Spanish, French, German and Italian.

LinguaLive is a browser-based voice application that transcribes your speech using **AssemblyAI**, generates a helpful language-learning response via AssemblyAI's **LLM Gateway**, and speaks the reply back to you using text-to-speech. It is built as a polished reference application for demonstrating Applied AI Engineering across real-time speech, LLM integration and voice UX.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Project structure](#project-structure)
- [Installation](#installation)
- [Development](#development)
- [Environment variables](#environment-variables)
- [API](#api)
- [System Architecture](#system-architecture)
- [Planned stages](#planned-stages)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 LTS or later |
| npm | 10 or later (bundled with Node 20) |

---

## Project structure

```
lingualive/
├── client/                 # React + TypeScript + Vite frontend
│   ├── public/             # Static assets (favicon, etc.)
│   ├── src/
│   │   ├── components/     # UI components (Header, MicButton, StatusIndicator, ConversationView, TutorResponsePanel, etc.)
│   │   ├── lib/            # Real-time audio, AssemblyAI streaming & LLM API
│   │   │   ├── audioWorkletProcessor.ts # Worklet downsampler (16 kHz, Int16 PCM LE)
│   │   │   ├── useMicrophone.ts         # AudioContext & Worklet lifecycle hook
│   │   │   ├── useAssemblyAI.ts         # AssemblyAI v3 WebSocket hook
│   │   │   ├── assemblyaiTypes.ts       # AssemblyAI v3 event definitions
│   │   │   └── tutorApi.ts              # Client helper for /api/tutor/respond
│   │   ├── App.tsx         # Root component
│   │   ├── constants.ts    # App-wide constants
│   │   ├── types.ts        # Shared TypeScript types
│   │   └── main.tsx        # React entry point
│   ├── index.html
│   ├── tailwind.config.js
│   ├── vite.config.ts
│   └── package.json
├── server/                 # Node.js + TypeScript + Express backend
│   ├── src/
│   │   ├── services/
│   │   │   └── llmGateway.ts # LLM Gateway service, validation & parsing
│   │   ├── index.ts        # Server entry point
│   │   └── routes.ts       # API routes (/api/health, /api/assemblyai/token, /api/tutor/respond)
│   ├── .env.example        # Environment variable template
│   └── package.json
├── .gitignore
└── package.json            # Monorepo root (npm workspaces)
```

---

## Installation

```bash
# Clone the repo
git clone <repo-url>
cd lingualive

# Install all workspace dependencies
npm install
```

---

## Development

### Run both frontend and backend together (recommended)

```bash
npm run dev
```

| Service | URL |
|---------|-----|
| Frontend (Vite) | http://localhost:5173 |
| Backend (Express) | http://localhost:3001 |

Vite proxies `/api/*` requests to `http://localhost:3001` so CORS is not an issue in development.

### Run individually

```bash
# Frontend only
npm run dev:client

# Backend only
npm run dev:server
```

### Production build

```bash
# Client
npm run build --workspace=client

# Server
npm run build --workspace=server
```

### Tests

```bash
# Run server validation & parsing test suite
npm run test --workspace=server
```

---

## Environment variables

Copy the template and fill in your credentials in `server/.env`:

```bash
cp server/.env.example server/.env
```

| Variable | Description |
|----------|-------------|
| `PORT` | Express server port (default: `3001`) |
| `CORS_ORIGIN` | Allowed frontend origin (default: `http://localhost:5173`) |
| `ASSEMBLYAI_API_KEY` | Your AssemblyAI API key (required for STT and LLM Gateway) |
| `ASSEMBLYAI_LLM_MODEL` | LLM Gateway model (default: `gpt-4.1` with automatic fallback to `qwen3.5-4b-32k-fast`) |

> **Never commit a `.env` file containing real credentials.**

---

## API

### `GET /api/health`

Confirms the server is running.

**Response `200 OK`**
```json
{
  "status": "ok",
  "service": "lingualive-server",
  "timestamp": "2026-11-22T18:00:00.000Z"
}
```

### `GET /api/assemblyai/token`

Requests a short-lived (60 s) streaming token from AssemblyAI using the server's `ASSEMBLYAI_API_KEY`. The permanent key is never sent to the client.

**Response `200 OK`**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### `GET /api/assemblyai/tts-token`

Requests a short-lived (60 s) temporary token from AssemblyAI specifically scoped for Text-to-Speech (`product: "tts"`). Kept separate from STT tokens.

**Response `200 OK`**
```json
{
  "token": "AQICAHhSP--gzqwd67dd..."
}
```

### `POST /api/tutor/respond`

Generates an intelligent language tutor response via AssemblyAI's LLM Gateway.

**Request**
```json
{
  "targetLanguage": "Spanish",
  "messages": [
    {
      "role": "user",
      "content": "How do I say I would like a coffee with milk?"
    }
  ]
}
```

**Response `200 OK`**
```json
{
  "phrase": "Me gustaría un café con leche.",
  "meaning": "I would like a coffee with milk.",
  "breakdown": [
    { "term": "Me gustaría", "meaning": "I would like" },
    { "term": "un café", "meaning": "a coffee" },
    { "term": "con leche", "meaning": "with milk" }
  ],
  "pronunciation": "meh goo-SHOO-tah-eh oon kah-fee kon lay-cheh",
  "usageTip": "This is the standard, polite way to order in Spain and most of Latin America."
}
```

---

## System Architecture

```
1. Speech Capture (Browser)
   navigator.mediaDevices.getUserMedia -> AudioWorklet (16 kHz, Int16 PCM LE)
       │
       ▼
2. Real-Time Streaming STT
   WebSocket wss://streaming.assemblyai.com/v3/ws
   (Temporary token issued by GET /api/assemblyai/token)
       │
       ▼
3. Final Transcript Event (end_of_turn: true)
   Browser posts to POST /api/tutor/respond with conversational history
       │
       ▼
4. AssemblyAI LLM Gateway
   POST https://llm-gateway.assemblyai.com/v1/chat/completions
   System prompt on backend + structured response parsing
       │
       ▼
5. Interactive Tutor UI
   Target-language phrase, English meaning, pronunciation guide,
   word-by-word breakdown, and cultural/usage tips.
       │
       ▼
6. Spoken Pronunciation (AssemblyAI TTS)
   WebSocket wss://tts.us.assemblyai.com/v1/ws
   (Temporary token issued by GET /api/assemblyai/tts-token)
   Streams 24 kHz PCM signed 16-bit audio -> Web Audio API gapless scheduling
```

---

## Planned stages

| Stage | Status | Description |
|-------|--------|-------------|
| **1 — Scaffold** | ✅ Completed | Project structure, UI shell, Express health check |
| **2 — Speech-to-Text** | ✅ Completed | Microphone capture via AudioWorklet, AssemblyAI v3 streaming STT |
| **3 — Tutor Response** | ✅ Completed | Intelligent pedagogical LLM integration via AssemblyAI LLM Gateway |
| **4 — Text-to-Speech** | ✅ Completed | Spoken tutor pronunciation via AssemblyAI TTS WebSocket (`assemblyai-tts-1`) |
| **5 — Polish & Deploy** | ⏳ Planned | Reconnection resilience, audio visualization, session analytics |
