# AI_NATIVE

AI_NATIVE is a provider-agnostic AI Application Compiler pipeline. It generates valid AppSpec schemas using a multi-stage approach (Intent Extraction -> Schema Generation -> AppSpec Generation), complete with validation and auto-repair.

## Features
- **Multi-Provider Routing**: Gemini, OpenAI, Groq, OpenRouter
- **Cost Tracking**: USD estimation and token usage per job stage
- **Streaming UI**: SSE based progress updates
- **Self-Healing**: AI pipeline auto-repairs structure, CRUD endpoints, dashboard, auth rules, and integrations

## Environment Variables

You must supply the following environment variables in `.env` to run the backend:

```env
GEMINI_API_KEY=your_gemini_key
OPENAI_API_KEY=your_openai_key
GROQ_API_KEY=your_groq_key
PORT=3000
```

## Deployment

### Backend
The backend is prepared for deployment on **Render**. Use the `render.yaml` configuration to spin up the web service. Set the API keys as environment variables in the Render dashboard.

### Frontend
The frontend (`/frontend`) is prepared for deployment on **Vercel**. Use the `vercel.json` file. Ensure that API endpoints point to the deployed Render instance instead of `localhost:3000` via Vercel environment variables or build configurations.

## Running Locally

1. Backend:
```sh
npm install
npx ts-node src/server.ts
```

2. Frontend:
```sh
cd frontend
npm install
npm run dev
```
