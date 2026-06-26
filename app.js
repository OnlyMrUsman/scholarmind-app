/* ScholarMind web app — client logic */
(function () {
  "use strict";

  // ---------- agent definitions (icons + matching keywords) ----------
  const AGENTS = [
    { key: "orchestrator", name: "Orchestrator", match: ["ORCHESTRATOR"], not: ["OUTPUT"], icon: iconBrain() },
    { key: "search",       name: "Search",       match: ["SEARCH"],       icon: iconSearch() },
    { key: "reader",       name: "Reader",        match: ["READER"],       icon: iconBook() },
    { key: "synthesis",    name: "Synthesis",     match: ["SYNTHESIS"],    icon: iconLayers() },
    { key: "writer",       name: "Writer",        match: ["WRITER"],       icon: iconPen() },
  ];

  // ---------- state ----------
  let mode = "analyze";       // analyze | compare | demo
  let running = false;

  const $ = (s) => document.querySelector(s);
  const el = {
    q: $("#q"), go: $("#goBtn"), goLabel: $("#goLabel"),
    rail: $("#rail"), railFill: $("#railFill"), pipelineStage: $("#pipelineStage"),
    results: $("#results"), chips: $("#chips"), modeHint: $("#modeHint"),
    statusPill: $("#statusPill"), statusText: $("#statusText"),
    themeBtn: $("#themeBtn"), themeIcon: $("#themeIcon"),
  };

  // ---------- theme ----------
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("sm-theme", t); } catch (e) {}
    el.themeIcon.innerHTML = t === "dark"
      ? '<path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z"/>'
      : '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>';
  }
  (function initTheme() {
    let t = "dark";
    try { t = localStorage.getItem("sm-theme") || "dark"; } catch (e) {}
    applyTheme(t);
  })();
  el.themeBtn.addEventListener("click", () =>
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark")
  );

  // ---------- build pipeline rail ----------
  function buildRail() {
    AGENTS.forEach((a, i) => {
      const st = document.createElement("div");
      st.className = "station"; st.id = "st-" + a.key;
      st.innerHTML =
        '<div class="node"><span class="num">' + (i + 1) + "</span>" + a.icon + "</div>" +
        '<div class="nm">' + a.name + "</div>" +
        '<div class="meta" id="meta-' + a.key + '"></div>';
      el.rail.appendChild(st);
    });
  }
  buildRail();

  function resetRail() {
    AGENTS.forEach((a) => {
      const st = $("#st-" + a.key); st.classList.remove("running", "done");
      $("#meta-" + a.key).textContent = "";
    });
    el.railFill.style.width = "0%";
  }
  function setStation(key, state, meta) {
    const st = $("#st-" + key); if (!st) return;
    st.classList.remove("running", "done");
    if (state) st.classList.add(state);
    if (meta != null) $("#meta-" + key).textContent = meta;
    const idx = AGENTS.findIndex((a) => a.key === key);
    const done = AGENTS.filter((a) => $("#st-" + a.key).classList.contains("done")).length;
    el.railFill.style.width = (done / AGENTS.length) * 100 + "%";
    if (state === "running" && idx >= 0)
      el.railFill.style.width = ((idx + 0.5) / AGENTS.length) * 100 + "%";
  }
  function matchAgent(title) {
    if (!title) return null;
    const T = title.toUpperCase();
    for (const a of AGENTS) {
      if (a.not && a.not.some((n) => T.includes(n))) continue;
      if (a.match.some((m) => T.includes(m))) return a.key;
    }
    return null;
  }

  // ---------- tabs ----------
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (running) return;
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      mode = tab.dataset.mode;
      el.goLabel.textContent = mode === "compare" ? "Compare" : mode === "demo" ? "Replay demo" : "Analyze";
      el.modeHint.textContent =
        mode === "demo" ? "Demo mode replays a real saved run — no network needed. Switch to Analyze for a live result."
        : mode === "compare" ? "Runs the same model two ways — with your RAG pipeline and without retrieval — side by side."
        : "Analyze sends your question to the live five-agent pipeline on Dify.";
    });
  });

  // ---------- chips & input ----------
  el.chips.addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    el.q.value = c.dataset.q; el.q.focus();
  });
  el.q.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  el.go.addEventListener("click", run);

  // ---------- main run ----------
  async function run() {
    if (running) return;
    let query = el.q.value.trim();
    if (!query && mode === "demo") {
      query = "What are recent advances and open challenges in evaluating progress toward artificial general intelligence?";
      el.q.value = query;
    }
    if (!query) { el.q.focus(); return; }
    running = true; el.go.disabled = true;
    el.pipelineStage.classList.add("show");
    resetRail();

    if (mode === "demo") { await runDemo(query); running = false; el.go.disabled = false; return; }
    if (mode === "compare") { await runCompare(query); running = false; el.go.disabled = false; return; }
    await runAnalyze(query); running = false; el.go.disabled = false;
  }

  // ---------- ANALYZE (live RAG via /api/rag) ----------
  async function runAnalyze(query) {
    el.results.innerHTML = reviewSkeleton();
    let answer = "";
    try {
      answer = await streamDify(query, (key, state, meta) => setStation(key, state, meta));
      AGENTS.forEach((a) => setStation(a.key, "done"));
      renderReview(parseReview(answer), { live: true });
    } catch (err) {
      el.results.innerHTML =
        '<div class="panel"><div class="err">Could not reach the live pipeline: ' +
        escapeHtml(err.message) +
        '. Make sure DIFY_API_KEY is set in your deployment, or use Demo mode for the presentation.</div></div>';
    }
  }

  // ---------- COMPARE (RAG vs no-RAG) ----------
  async function runCompare(query) {
    el.results.innerHTML =
      '<div class="verdict"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v20M2 12h20"/></svg>' +
      "<div><b>Same model, two methods.</b> Both columns use the same DeepSeek model. The left column adds your ScholarMind retrieval pipeline; the right column answers with no retrieval. Watch how grounding changes the citations.</div></div>" +
      '<div class="compare">' +
        '<div class="panel"><span class="col-tag good">● With retrieval (RAG)</span><div id="cmpRag">' + reviewSkeletonInner() + "</div></div>" +
        '<div class="panel"><span class="col-tag bad">● Without retrieval</span><div id="cmpNo">' + reviewSkeletonInner() + "</div></div>" +
      "</div>";

    const ragP = streamDify(query, (key, state, meta) => setStation(key, state, meta))
      .then((ans) => { AGENTS.forEach((a) => setStation(a.key, "done")); 
        $("#cmpRag").innerHTML = renderReviewHtml(parseReview(ans)); })
      .catch((e) => { $("#cmpRag").innerHTML = '<div class="err">RAG pipeline error: ' + escapeHtml(e.message) + "</div>"; });

    const noP = streamDeepseek(query, (txt) => { $("#cmpNo").innerHTML = mdToHtml(txt); })
      .then((txt) => {
        $("#cmpNo").innerHTML = mdToHtml(txt) +
          '<div class="warnline">⚠ No papers were retrieved. Any references above are produced from model memory and cannot be verified.</div>';
      })
      .catch((e) => { $("#cmpNo").innerHTML = '<div class="err">Direct model error: ' + escapeHtml(e.message) + "</div>"; });

    await Promise.allSettled([ragP, noP]);
  }

  // ---------- streaming helpers ----------
  async function streamDify(query, onNode) {
    const res = await fetch("/api/rag", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok || !res.body) throw new Error("status " + res.status);
    setStatus(true);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", answer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]" || !payload) continue;
        let ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
        if (ev.event === "node_started") {
          const k = matchAgent(ev.data && ev.data.title);
          if (k) onNode(k, "running", "running…");
        } else if (ev.event === "node_finished") {
          const k = matchAgent(ev.data && ev.data.title);
          if (k) {
            const d = ev.data || {};
            let meta = "done";
            if (d.elapsed_time) meta = (+d.elapsed_time).toFixed(1) + "s";
            if (d.execution_metadata && d.execution_metadata.total_tokens)
              meta = d.execution_metadata.total_tokens + " tok · " + meta;
            onNode(k, "done", meta);
          }
        } else if (ev.event === "message") {
          answer += ev.answer || "";
        } else if (ev.event === "agent_message") {
          answer += ev.answer || "";
        }
      }
    }
    return answer;
  }

  async function streamDeepseek(query, onText) {
    const res = await fetch("/api/norag", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });
    if (!res.ok || !res.body) throw new Error("status " + res.status);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "", text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split("\n"); buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith("data:")) continue;
        const payload = s.slice(5).trim();
        if (payload === "[DONE]" || !payload) continue;
        let ev; try { ev = JSON.parse(payload); } catch (e) { continue; }
        const delta = ev.choices && ev.choices[0] && ev.choices[0].delta && ev.choices[0].delta.content;
        if (delta) { text += delta; onText(text); }
      }
    }
    return text;
  }

  function setStatus(live) {
    el.statusPill.className = "pill " + (live ? "live" : "demo");
    el.statusText.textContent = live ? "Live API" : "Demo mode";
  }

  // ---------- review parsing & rendering ----------
  function parseReview(md) {
    const refs = [];
    const refSec = md.split(/#+\s*References/i)[1];
    if (refSec) {
      refSec.split("\n").forEach((l) => {
        const m = l.match(/\[arXiv:([^\]]+)\]\s*[—\-–]\s*(.+)/i);
        if (m) refs.push({ id: m[1].trim(), title: m[2].trim() });
      });
    }
    return { md: md, refs: refs };
  }

  function renderReview(parsed, opts) {
    el.results.innerHTML = renderReviewHtml(parsed, opts);
    animateStats();
  }
  function renderReviewHtml(parsed, opts) {
    opts = opts || {};
    const citeCount = (parsed.md.match(/\[arXiv:/g) || []).length;
    const stats =
      '<div class="stat-row" style="margin-bottom:22px">' +
        '<div class="stat"><div class="n" data-to="' + parsed.refs.length + '">0</div><div class="l">Papers retrieved</div></div>' +
        '<div class="stat"><div class="n" data-to="' + citeCount + '">0</div><div class="l">Inline citations</div></div>' +
        '<div class="stat"><div class="n">5</div><div class="l">Agents run</div></div>' +
      "</div>";
    const toolbar =
      '<div class="toolbar">' +
        '<button class="tbtn" onclick="window.__copyMd()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/></svg>Copy</button>' +
        '<button class="tbtn" onclick="window.__downloadMd()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12M7 11l5 4 5-4M5 21h14"/></svg>Markdown</button>' +
      "</div>";
    window.__lastMd = parsed.md;
    let papers = "";
    if (parsed.refs.length) {
      papers =
        '<div class="panel"><h2>Retrieved papers</h2><div class="papers" style="margin-top:16px">' +
        parsed.refs.map((r) =>
          '<a class="paper" href="https://arxiv.org/abs/' + arxivUrl(r.id) + '" target="_blank" rel="noopener">' +
          '<div class="pid">arXiv:' + escapeHtml(r.id) + "</div><div class=\"pt\">" + escapeHtml(r.title) + "</div></a>"
        ).join("") +
        "</div></div>";
    }
    return (
      (opts.live === false ? "" : "") +
      '<div class="panel review">' + (opts.noToolbar ? "" : toolbar) + (opts.noStats ? "" : stats) +
      mdToHtml(parsed.md) + "</div>" + papers
    );
  }
  function reviewSkeleton() { return '<div class="panel review">' + reviewSkeletonInner() + "</div>"; }
  function reviewSkeletonInner() {
    let s = ""; for (let i = 0; i < 6; i++) s += '<div class="skeleton" style="width:' + (60 + Math.random() * 38) + '%"></div>';
    return s;
  }
  function animateStats() {
    document.querySelectorAll(".stat .n[data-to]").forEach((n) => {
      const to = +n.dataset.to; let cur = 0;
      const step = Math.max(1, Math.ceil(to / 18));
      const t = setInterval(() => { cur += step; if (cur >= to) { cur = to; clearInterval(t); } n.textContent = cur; }, 35);
    });
  }

  // ---------- markdown (light) + citation linkify ----------
  function mdToHtml(md) {
    const lines = md.split("\n");
    let html = "", inList = false;
    for (let raw of lines) {
      let line = raw.replace(/\s+$/,"");
      if (!line.trim()) { if (inList) { html += "</ul>"; inList = false; } continue; }
      const h = line.match(/^(#{1,4})\s+(.*)/);
      if (h) { if (inList){html+="</ul>";inList=false;} const lvl = h[1].length; html += "<h" + (lvl<=1?2:3) + ">" + inline(h[2]) + "</h" + (lvl<=1?2:3) + ">"; continue; }
      const li = line.match(/^[\-\*]\s+(.*)/);
      if (li) { if (!inList){html+="<ul style='margin:8px 0 12px 20px'>";inList=true;} html += "<li style='margin-bottom:6px'>" + inline(li[1]) + "</li>"; continue; }
      if (inList){html+="</ul>";inList=false;}
      html += "<p>" + inline(line) + "</p>";
    }
    if (inList) html += "</ul>";
    return html;
  }
  function inline(s) {
    s = escapeHtml(s);
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\[arXiv:([^\]]+)\]/g, function (_, id) {
      return '<a class="cite" href="https://arxiv.org/abs/' + arxivUrl(id) + '" target="_blank" rel="noopener">arXiv:' + id + "</a>";
    });
    return s;
  }
  function arxivUrl(id) { return String(id).replace(/^arXiv:/i, "").replace(/v\d+$/,""); }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }

  // ---------- copy / download ----------
  window.__copyMd = function () { navigator.clipboard && navigator.clipboard.writeText(window.__lastMd || ""); };
  window.__downloadMd = function () {
    const blob = new Blob([window.__lastMd || ""], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "scholarmind-review.md"; a.click();
  };

  // ---------- DEMO MODE (real saved AGI run) ----------
  async function runDemo(query) {
    setStatus(false);
    el.results.innerHTML = reviewSkeleton();
    const timings = [
      ["orchestrator", "262 tok · 2.1s", 900],
      ["search", "0.79s", 800],
      ["reader", "3649 tok · 10.9s", 1300],
      ["synthesis", "2337 tok · 16.9s", 1300],
      ["writer", "2834 tok · 16.7s", 1200],
    ];
    for (const [k, meta, wait] of timings) {
      setStation(k, "running", "running…");
      await sleep(wait);
      setStation(k, "done", meta);
    }
    renderReview(parseReview(DEMO_AGI), { });
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

  // real output captured from the live AGI run
  const DEMO_AGI = [
"# Introduction",
"The pursuit of advanced artificial intelligence (AI) has generated a rich and multifaceted body of research, spanning foundational theories of machine intelligence to practical applications in high-stakes domains like healthcare. Understanding how these different strands of inquiry relate to one another—from the design of general-purpose architectures to the imperative of human interpretability—is crucial for charting a responsible path forward. This mini-review synthesizes key themes from the recent literature, highlighting areas of consensus, unresolved tensions, and critical gaps that warrant further investigation.",
"# Thematic Review",
"A foundational theme in the literature concerns the development of high-level architectures and frameworks for advanced AI. Several works argue that achieving general intelligence or sophisticated problem-solving requires moving beyond narrow, task-specific models. One proposal advocates for a unified or hybrid approach to Artificial General Intelligence (AGI), envisioning an \"Artificial Scientist\" capable of autonomous discovery [arXiv:2110.01831v1]. This call for structure is echoed in a separate work that proposes a unified framework for Creative Problem Solving, suggesting that disparate cognitive capabilities must be integrated within a coherent system [arXiv:2204.10358v1]. Even earlier theoretical work on mental models provides a conceptual basis for how such systems might represent and reason about the world [arXiv:cs/9903016v1].",
"A second major theme addresses the critical relationship between AI systems and their human users, focusing on explainability, trust, and effective communication. Research on explainable AI (XAI) for trustworthy healthcare emphasizes that for AI to be adopted in clinical settings, its decisions must be interpretable to practitioners [arXiv:2304.04780v1]. This is complemented by work that critically evaluates the actual helpfulness of current XAI methods, questioning whether existing techniques meaningfully aid human understanding [arXiv:2410.11896v1].",
"# Agreements and Contradictions",
"Across these papers there is broad agreement that progress toward advanced AI cannot be measured by capability benchmarks alone; structure, interpretability, and grounding matter. A productive tension exists, however, between the drive toward unified general architectures and the domain-specific, human-centered demands of fields like clinical decision-making. The literature does not yet resolve whether general frameworks transfer usefully into specialized, high-stakes domains.",
"# Research Gaps and Future Directions",
"Several critical gaps emerge from this synthesis. First, there is a pronounced lack of integration between foundational theory and practical evaluation. High-level frameworks for AGI and creative problem-solving [arXiv:2110.01831v1, arXiv:cs/9903016v1] are not connected to empirical studies of specific methods in domains like healthcare [arXiv:1301.2158v1, arXiv:2410.11896v1]. Future work should strive to test theoretical architectures in concrete, real-world scenarios. Second, the link between AGI research and domain-specific AI is underexplored. Finally, proposed classification schemes lack empirical validation; the practical utility of the taxonomy proposed in [arXiv:2104.13155v2] has not been demonstrated.",
"# References",
"[arXiv:2110.01831v1] — Toward an Artificial Scientist: A Unified or Hybrid Approach to AGI",
"[arXiv:2204.10358v1] — Creative Problem Solving: A Unified Framework",
"[arXiv:cs/9903016v1] — Mental Models and the Mind",
"[arXiv:2110.01835v1] — The Fermi Paradox and the Incomprehensibility of AGI",
"[arXiv:2304.04780v1] — Explainable AI for Trustworthy Healthcare",
"[arXiv:2410.11896v1] — Evaluating the Helpfulness of XAI Methods",
"[arXiv:1301.2158v1] — Foundations of Medical Informatics",
"[arXiv:2104.13155v2] — A Classification Standard for Artificial Intelligence",
  ].join("\n\n");

  // ---------- icons ----------
  function iconBrain(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 4a2.5 2.5 0 00-2.5 2.5A2.5 2.5 0 004 9a2.5 2.5 0 001 4 2.5 2.5 0 002 4 2.5 2.5 0 005 0V4.5A2.5 2.5 0 009 4z"/><path d="M15 4a2.5 2.5 0 012.5 2.5A2.5 2.5 0 0120 9a2.5 2.5 0 01-1 4 2.5 2.5 0 01-2 4"/></svg>';}
  function iconSearch(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>';}
  function iconBook(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 5a2 2 0 012-2h12v16H6a2 2 0 00-2 2V5z"/><path d="M18 17H6"/></svg>';}
  function iconLayers(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/></svg>';}
  function iconPen(){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M16 3l5 5L8 21H3v-5L16 3z"/></svg>';}

})();
