# UI-Based Novel Reading Platform

A full-stack MVP for a digital novel experience with:
- Reader UI with realistic page flip, chapter navigation, progress, and theme toggle
- Creator dashboard to draft chapters, style text with Gemini, preview JSON-rendered output, and publish
- Node.js + Express API with MongoDB persistence

## Tech Stack

- Frontend: React + Vite + react-pageflip
- Backend: Node.js + Express + Mongoose
- AI: Google Gemini API (`@google/generative-ai`)
- Database: MongoDB

## Project Structure

```text
b4/
  client/
    index.html
    package.json
    vite.config.js
    src/
      App.jsx
      main.jsx
      styles.css
      api/
        chaptersApi.js
      utils/
        paginateContent.js
      components/
        creator/
          CreatorView.jsx
          PreviewPanel.jsx
        reader/
          ReaderView.jsx
          BookPage.jsx
          ContentRenderer.jsx
  server/
    .env.example
    package.json
    src/
      index.js
      db/
        connect.js
      models/
        Chapter.js
      routes/
        chapters.js
      services/
        geminiService.js
  package.json
  .gitignore
  README.md
```

## Features Implemented

### Reader Experience
- Centered, book-style reading area with serif typography
- Light/Dark mode with elegant palette
- Realistic page-turn animation via `react-pageflip`
- Next/Previous buttons (visible on desktop, fade in fullscreen)
- Chapter select dropdown
- Current page indicator (`Page X / Y`)
- Dynamic JSON content rendering:
  - `paragraph` -> body text
  - `highlight` -> emphasized centered italic quote block
  - `divider` -> elegant `— ✦ —` scene separator
- Top progress bar with smooth updates
- **Fullscreen immersive mode:**
  - Minimalist UI (header, controls hidden)
  - Page flip via side arrows, arrow keys, or space bar
  - Auto-fading navigation: arrows fade after 2.8s, reappear on mouse/touch
  - Subtle page counter at bottom (also fades with controls)
  - ESC key or Exit button to exit fullscreen
  - Optimized for distraction-free reading
- Responsive layout for desktop and mobile

### Creator Experience
- Chapter title input
- Raw chapter text textarea
- `Style with AI` action that calls Gemini
- Preview mode rendering structured output
- Publish action that stores chapter and makes it visible in Reader

### Gemini Integration
The backend uses this prompt logic:

> You are a novel formatting engine. Convert the given text into structured JSON for a digital reading UI. Identify paragraphs, emotional highlights, and scene dividers. Do not change wording.

Returned data is validated against expected JSON shape before being saved.

## Setup and Run

## 1) Prerequisites
- Node.js 18+
- MongoDB running locally or remote MongoDB URI
- Gemini API key

## 2) Install Dependencies
From repository root:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

Or:

```bash
npm run install:all
```

## 3) Configure Environment
Copy and edit:

- `server/.env.example` -> `server/.env`

Set values:

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/novel_platform
GEMINI_API_KEY=your_gemini_api_key_here
CLIENT_ORIGIN=http://localhost:5173
```

## 4) Run in Development
From root:

```bash
npm run dev
```

This starts:
- Backend on `http://localhost:5000`
- Frontend on `http://localhost:5173`

## 5) Build Frontend

```bash
npm run build --prefix client
```

## API Overview

Base URL: `http://localhost:5000/api`

- `GET /health` -> health check
- `GET /chapters` -> list published chapters
- `GET /chapters/:id` -> get published chapter by ID
- `POST /chapters` -> create draft `{ title, rawText }`
- `POST /chapters/style` -> Gemini style `{ title, rawText }`
- `PUT /chapters/:id` -> update draft content/title/text
- `POST /chapters/:id/publish` -> publish chapter

## Notes
- Creator dashboard is intentionally open for MVP speed.
- Gemini calls are server-side only to protect API keys.
- Chapters are persisted in MongoDB and instantly available to reader after publish.
- One-time cleanup for old demo data:
  - Dry run: `npm run cleanup:demo --prefix server`
  - Execute delete: `npm run cleanup:demo:execute --prefix server`

## Keyboard Shortcuts (Fullscreen Reading Mode)
- **Arrow Right** or **Space** → Next page
- **Arrow Left** → Previous page
- **ESC** → Exit fullscreen
