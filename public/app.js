// TextShift frontend — vanilla JS, no build step, no framework.
(() => {
  "use strict";

  const API = {
    humanize: "/api/humanize",
    aiify: "/api/aiify",
    detect: "/api/detect",
    compare: "/api/compare",
  };

  // ---------- theme ----------
  const root = document.documentElement;
  const themeToggle = document.getElementById("theme-toggle");
  const sunIcon = document.getElementById("theme-icon-sun");
  const moonIcon = document.getElementById("theme-icon-moon");

  function applyTheme(theme) {
    root.setAttribute("data-theme", theme);
    sunIcon.style.display = theme === "dark" ? "none" : "block";
    moonIcon.style.display = theme === "dark" ? "block" : "none";
    localStorage.setItem("textshift-theme", theme);
  }

  const savedTheme =
    localStorage.getItem("textshift-theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  applyTheme(savedTheme);

  themeToggle.addEventListener("click", () => {
    applyTheme(root.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  // ---------- tabs ----------
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
      });
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      panels.forEach((p) => p.classList.remove("active"));
      document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
    });
  });

  // ---------- shared state ----------
  // Remembers the most recent AI<->Human transformation so the Compare tab can
  // offer a one-click "use last transformation" instead of forcing a repaste.
  let lastTransformation = null; // { original, result }

  // ---------- helpers ----------
  function countWords(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  function updateCounts(panel, role, textarea) {
    const el = panel.querySelector(`.counts[data-count-for="${role}"]`);
    if (!el) return;
    el.textContent = `${countWords(textarea.value)} words · ${textarea.value.length} chars`;
  }

  function setStatus(panel, kind, message) {
    const row = panel.querySelector('[data-role="status"]');
    if (!row) return;
    if (!message) {
      row.innerHTML = "";
      return;
    }
    row.innerHTML = `<span class="${kind}">${escapeHtml(message)}</span>`;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* ignore parse failure, handled below */
    }
    if (!res.ok) {
      const msg = (data && data.error) || `Request failed (HTTP ${res.status}).`;
      throw new Error(msg);
    }
    return data;
  }

  function withLoading(panel, button, fn) {
    return async (...args) => {
      const buttons = panel.querySelectorAll("button");
      buttons.forEach((b) => (b.disabled = true));
      setStatus(panel, "loading", "Working");
      try {
        await fn(...args);
        setStatus(panel, "", "");
      } catch (err) {
        setStatus(panel, "error", err.message || "Something went wrong.");
      } finally {
        buttons.forEach((b) => (b.disabled = false));
      }
    };
  }

  // ---------- generic transform panel wiring (AI->Human, Human->AI) ----------
  function wireTransformPanel(panelId, endpoint, buildPayload) {
    const panel = document.getElementById(panelId);
    const input = panel.querySelector('[data-role="input"]');
    const output = panel.querySelector('[data-role="output"]');

    updateCounts(panel, "input", input);
    updateCounts(panel, "output", output);
    input.addEventListener("input", () => updateCounts(panel, "input", input));

    panel.querySelector('[data-action="transform"]').addEventListener(
      "click",
      withLoading(panel, null, async () => {
        const text = input.value.trim();
        if (!text) throw new Error("Enter some text first.");
        const payload = buildPayload(panel, text);
        const data = await postJson(endpoint, payload);
        output.value = data.result;
        updateCounts(panel, "output", output);
        lastTransformation = { original: text, result: data.result };
      })
    );

    panel.querySelector('[data-action="clear"]').addEventListener("click", () => {
      input.value = "";
      output.value = "";
      updateCounts(panel, "input", input);
      updateCounts(panel, "output", output);
      setStatus(panel, "", "");
    });

    panel.querySelector('[data-action="copy"]').addEventListener("click", async () => {
      if (!output.value) return;
      await navigator.clipboard.writeText(output.value);
      setStatus(panel, "loading", "");
      setStatus(panel, "", "Copied to clipboard.");
    });

    panel.querySelector('[data-action="download"]').addEventListener("click", () => {
      if (!output.value) return;
      const blob = new Blob([output.value], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${panelId}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  wireTransformPanel("panel-ai-human", API.humanize, (panel, text) => ({
    text,
    style: panel.querySelector('[data-role="style"]').value,
    level: panel.querySelector('[data-role="level"]').value,
    preserveLength: panel.querySelector('[data-role="preserveLength"]').checked,
    preserveTerminology: panel.querySelector('[data-role="preserveTerminology"]').checked,
  }));

  wireTransformPanel("panel-human-ai", API.aiify, (panel, text) => ({
    text,
    style: panel.querySelector('[data-role="style"]').value,
    structureLevel: panel.querySelector('[data-role="level"]').value,
    preserveLength: panel.querySelector('[data-role="preserveLength"]').checked,
  }));

  // ---------- detector panel ----------
  (function wireDetector() {
    const panel = document.getElementById("panel-detector");
    const input = panel.querySelector('[data-role="input"]');
    const resultBox = panel.querySelector('[data-role="detector-result"]');

    updateCounts(panel, "input", input);
    input.addEventListener("input", () => updateCounts(panel, "input", input));

    function renderResult(data) {
      const confBadge = `<span class="badge">${data.confidence} confidence</span>`;
      resultBox.innerHTML = `
        <div class="score-row">
          <div class="score-label"><span>AI-likeness</span><span>${data.ai_likeness}%</span></div>
          <div class="score-track"><div class="score-fill warn" style="width:${data.ai_likeness}%"></div></div>
        </div>
        <div class="score-row">
          <div class="score-label"><span>Human-likeness</span><span>${data.human_likeness}%</span></div>
          <div class="score-track"><div class="score-fill" style="width:${data.human_likeness}%"></div></div>
        </div>
        <p><strong>${labelFor(data.classification)}</strong>${confBadge}</p>
        <ul class="observations">${data.observations.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
        <p class="explanation">${escapeHtml(data.explanation)}</p>
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      `;
    }

    function labelFor(classification) {
      return (
        { more_human_like: "More human-like", more_ai_like: "More AI-like", mixed_uncertain: "Mixed / uncertain" }[
          classification
        ] || "Mixed / uncertain"
      );
    }

    panel.querySelector('[data-action="detect"]').addEventListener(
      "click",
      withLoading(panel, null, async () => {
        const text = input.value.trim();
        if (!text) throw new Error("Enter some text first.");
        const data = await postJson(API.detect, { text });
        renderResult(data);
      })
    );

    panel.querySelector('[data-action="clear"]').addEventListener("click", () => {
      input.value = "";
      updateCounts(panel, "input", input);
      resultBox.innerHTML = '<p class="empty-hint">Run an analysis to see an estimate here.</p>';
      setStatus(panel, "", "");
    });
  })();

  // ---------- compare panel ----------
  (function wireCompare() {
    const panel = document.getElementById("panel-compare");
    const originalEl = panel.querySelector('[data-role="original"]');
    const transformedEl = panel.querySelector('[data-role="transformed"]');
    const resultBox = panel.querySelector('[data-role="compare-result"]');

    updateCounts(panel, "original", originalEl);
    updateCounts(panel, "transformed", transformedEl);
    originalEl.addEventListener("input", () => updateCounts(panel, "original", originalEl));
    transformedEl.addEventListener("input", () => updateCounts(panel, "transformed", transformedEl));

    panel.querySelector('[data-action="load-last"]').addEventListener("click", () => {
      if (!lastTransformation) {
        setStatus(panel, "error", "Run an AI → Human or Human → AI transformation first.");
        return;
      }
      originalEl.value = lastTransformation.original;
      transformedEl.value = lastTransformation.result;
      updateCounts(panel, "original", originalEl);
      updateCounts(panel, "transformed", transformedEl);
    });

    function renderResult(data) {
      resultBox.innerHTML = `
        <table class="stat-table">
          <thead><tr><th></th><th>Original</th><th>Transformed</th></tr></thead>
          <tbody>
            <tr><td>Words</td><td class="num">${data.original.wordCount}</td><td class="num">${data.transformed.wordCount}</td></tr>
            <tr><td>Characters</td><td class="num">${data.original.charCount}</td><td class="num">${data.transformed.charCount}</td></tr>
            <tr><td>Sentences</td><td class="num">${data.original.sentenceCount}</td><td class="num">${data.transformed.sentenceCount}</td></tr>
            <tr><td>Avg. sentence length</td><td class="num">${data.original.avgSentenceLength}</td><td class="num">${data.transformed.avgSentenceLength}</td></tr>
            <tr><td>Estimated repetition</td><td class="num">${data.original.repetitionScore}%</td><td class="num">${data.transformed.repetitionScore}%</td></tr>
            <tr><td>AI-likeness (est.)</td><td class="num">${data.aiLikeness.before}%</td><td class="num">${data.aiLikeness.after}%</td></tr>
            <tr><td>Human-likeness (est.)</td><td class="num">${data.humanLikeness.before}%</td><td class="num">${data.humanLikeness.after}%</td></tr>
          </tbody>
        </table>
        <ul class="observations">${data.observations.map((o) => `<li>${escapeHtml(o)}</li>`).join("")}</ul>
        <p class="disclaimer">${escapeHtml(data.disclaimer)}</p>
      `;
    }

    panel.querySelector('[data-action="do-compare"]').addEventListener(
      "click",
      withLoading(panel, null, async () => {
        const original = originalEl.value.trim();
        const transformed = transformedEl.value.trim();
        if (!original || !transformed) throw new Error("Fill in both the original and transformed text.");
        const data = await postJson(API.compare, { original, transformed });
        renderResult(data);
      })
    );

    panel.querySelector('[data-action="clear"]').addEventListener("click", () => {
      originalEl.value = "";
      transformedEl.value = "";
      updateCounts(panel, "original", originalEl);
      updateCounts(panel, "transformed", transformedEl);
      resultBox.innerHTML = "";
      setStatus(panel, "", "");
    });
  })();
})();
