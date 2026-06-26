// Vercel Edge Function — proxies to the Dify ScholarMind pipeline.
// The API key stays on the server and is never exposed to the browser.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const key = process.env.DIFY_API_KEY;
  const base = process.env.DIFY_BASE_URL || "https://api.dify.ai/v1";

  if (!key) {
    return new Response(
      JSON.stringify({ error: "DIFY_API_KEY is not configured in the deployment." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let query = "";
  try { ({ query } = await req.json()); } catch (e) {}
  if (!query) return new Response(JSON.stringify({ error: "Missing query" }), { status: 400 });

  const upstream = await fetch(`${base}/chat-messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: {},
      query: query,
      response_mode: "streaming",
      user: "scholarmind-web",
      conversation_id: "",
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: "Dify error " + upstream.status, detail: text.slice(0, 300) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  // Pipe the Server-Sent Events straight through to the browser.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
