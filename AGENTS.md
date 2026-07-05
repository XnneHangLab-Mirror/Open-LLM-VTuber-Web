# AGENTS.md

Open-LLM-VTuber-Web is the Electron + React frontend for XnneHangLab. It provides Live2D character rendering, real-time voice chat, and WebSocket-based communication with the backend server.

## Project Structure

```
frontend/
├── src/
│   ├── main/                     # Electron main process
│   │   ├── index.ts              #   Entry point, IPC handlers (window, mouse, screen capture)
│   │   ├── window-manager.ts     #   Window state, modes (window/pet)
│   │   └── menu-manager.ts       #   System tray & context menus
│   ├── renderer/src/             # React renderer process
│   │   ├── App.tsx               #   Root component, provider setup
│   │   ├── components/           #   UI components (canvas, footer, sidebar, electron, ui)
│   │   ├── context/              #   14 Context providers (state management)
│   │   ├── services/             #   WebSocket handler & service
│   │   ├── hooks/                #   Custom hooks (canvas, electron, footer, sidebar, utils)
│   │   ├── live2d/               #   Cubism SDK integration, pose mixer, lip-sync
│   │   ├── types/                #   TypeScript type definitions
│   │   ├── utils/                #   Utility functions
│   │   └── locales/              #   i18n translation files
│   └── preload/                  # Electron preload scripts
├── WebSDK/                       # Cubism SDK for Live2D rendering
└── package.json                  # Electron + Vite + React 18
```

## Architecture

```
Electron Main Process  ←IPC→  React Renderer  ←WebSocket→  Backend (FastAPI)
  Window / Tray / Capture       Live2D + Chat UI              Agent + TTS/ASR
```

### State Management

Pure React Context API — 14 specialized contexts, no Redux/Zustand:

| Context | Responsibility |
|---------|---------------|
| `AiStateContext` | Conversation state (idle, thinking, speaking, listening) |
| `WebSocketContext` | Connection state & messaging |
| `Live2DConfigContext` | Model configuration & loading |
| `ChatHistoryContext` | Conversation history & messages |
| `VADContext` | Voice Activity Detection (mic control) |
| `SubtitleContext` | Subtitle display |
| `GroupContext` | Multi-user group sessions |
| `MoodContext` | Character mood state |
| `CameraContext` | Camera capture |
| `ScreenCaptureContext` | Screen capture |

### WebSocket Handler (central hub)

`services/websocket-handler.tsx` is the state orchestrator:
- Receives backend messages (audio, control, model updates, chat history)
- Coordinates state updates across multiple contexts
- Manages audio playback queue with volume-based lip-sync

### Live2D

- Cubism SDK (`WebSDK/`) for model rendering
- Pose mixer: idle/speech layers with expression blending
- Audio-driven lip-sync with volume arrays
- Supports model switching, expressions, motion playback

### Display Modes

- **Window mode**: full UI — sidebar, footer, Live2D canvas
- **Pet mode**: minimal overlay — Live2D + speech bubble only

## Dev Commands

```bash
npm install               # Install dependencies
npm run dev               # Electron app in dev mode
npm run dev:web           # Web-only version (no Electron)

npm run build:win         # Build for Windows
npm run build:mac         # Build for macOS
npm run build:linux       # Build for Linux
npm run build:web         # Build web version

npm run lint              # ESLint
npm run lint:fix          # ESLint with auto-fix
npm run typecheck         # TypeScript type check (node + web)
npm run format            # Prettier
npm run extract-translations  # Extract i18n strings
```

## Conventions

- Same gitmoji commit convention as parent project (`:sparkles: feat:`, `:bug: fix:`, etc.)
- UI text in Chinese, code/comments in English
- Chakra UI v3 component library
- Main branch: `main`; create feature branches from it
- Backend connection required — Live2D models and audio streamed from backend
