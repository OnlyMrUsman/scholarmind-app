// Vercel Edge Function — calls the DeepSeek model DIRECTLY with no retrieval.
// This is the "without RAG" side of the comparison: same model, no papers.
export const config = { runtime: "edge" };

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: "DEEPSEEK_API_KEY is not configured. Add it to enable the no-retrieval comparison." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  let query = "";
  try { ({ query } = await req.json()); } catch (e) {}
  if (!query) return new Response(JSON.stringify({ error: "Missing query" }), { status: 400 });

  const system =
    "You are a research assistant writing a short academic literature review. " +
    "You have NO access to external papers, databases, or the internet. " +
    "Answer using only your own training knowledge. Structure the answer with an Introduction, " +
    "a Thematic Review, and Research Gaps. If you mention prior work, you may cite it as you recall it.";

  const upstream = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      stream: true,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        { role: "user", content: query },
      ],
    }),
  });

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return new Response(
      JSON.stringify({ error: "DeepSeek error " + upstream.status, detail: text.slice(0, 300) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
