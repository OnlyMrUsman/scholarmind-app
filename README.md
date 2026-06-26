# ScholarMind | Web Application

A dedicated web application for the ScholarMind multi-agent research assistant.
It is **not** the Dify chat interface: it is a custom front-end that drives the
five-agent pipeline and visualizes each agent working in real time.

## What it does

- **Analyze** — sends a research question to the live five-agent pipeline on Dify
  and animates each agent (Orchestrator → Search → Reader → Synthesis → Writer)
  as it runs, then renders the cited review with clickable arXiv links.
- **Compare RAG vs No-RAG** — runs the *same* DeepSeek model two ways, side by side:
  once through the retrieval pipeline (grounded, real citations) and once with no
  retrieval (fluent but unverifiable). A clear demonstration of why RAG matters.
- **Demo** — replays a real saved AGI run with no network needed. Use this as a
  safety net during a live presentation.
- Dark / light theme, responsive, keyboard accessible, copy / download review.

## Files

```
index.html        the whole front-end (UI + styles)
app.js            client logic: modes, streaming, pipeline animation, rendering
api/rag.js        serverless function → proxies to your Dify pipeline (hides key)
api/norag.js      serverless function → calls DeepSeek directly (no retrieval)
vercel.json       Vercel configuration
```

## Deploy to Vercel (free public link)

### 1. Put the project on GitHub
Create a new repository (for example `scholarmind-app`) and upload the contents
of this folder to it.

### 2. Get your keys
- **Dify API key:** open your ScholarMind app in Dify → left sidebar → **API Access**
  → **API Key** → create a key (it starts with `app-...`).
- **DeepSeek API key (optional, for the Compare tab):** sign in at
  platform.deepseek.com → API Keys → create one (starts with `sk-...`).
  *If you skip this, the Analyze and Demo tabs still work fully.*

### 3. Import to Vercel
1. Go to vercel.com and sign in with GitHub.
2. Click **Add New → Project** and import your `scholarmind-app` repository.
3. Framework preset: **Other** (no build step needed).
4. Before deploying, open **Environment Variables** and add:

   | Name | Value |
   |------|-------|
   | `DIFY_API_KEY` | your `app-...` key |
   | `DIFY_BASE_URL` | `https://api.dify.ai/v1` |
   | `DEEPSEEK_API_KEY` | your `sk-...` key (optional) |

5. Click **Deploy**.

### 4. Share the link
Vercel gives you a public URL like `https://scholarmind-app.vercel.app`.
Anyone can open it on a laptop and use the app — the keys stay hidden on the server.

## Run locally (optional)
Because the API routes need the Vercel runtime, the easiest local test is:
```
npm i -g vercel
vercel dev
```
Then open the printed local URL. (Opening `index.html` directly works too, but only
the **Demo** tab will function without the serverless routes.)

## Notes
- The keys are read only on the server (in `api/rag.js` and `api/norag.js`); they are
  never sent to the browser.
- If a live call fails during a presentation (e.g. network), switch to the **Demo**
  tab, which needs no network.
