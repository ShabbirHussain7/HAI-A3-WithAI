// ======= CONFIG — fill these =======
const CSV_URL = "https://raw.githubusercontent.com/ShabbirHussain7/HAI-A3-Web/refs/heads/main/data/test_sample_220.csv"; // your CSV raw URL
const RAW_BASE = "https://raw.githubusercontent.com/ShabbirHussain7/HAI-A3/refs/heads/main/"; // root for relative image_path, end with /
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwlfmHVYsW2vCZR78XDhcHaXSBtU91ovCUJNyNthm640HcYZZT_KpOuGRyeS_W5-uA1Jw/exec";
// ===================================

const COLS = {
  url: "image_path",
  true_label: "true_label",
  predicted_label: "predicted_label",
  prob_NORMAL: "prob_NORMAL",
  prob_PNEUMONIA: "prob_PNEUMONIA",
  prob_TUBERCULOSIS: "prob_TUBERCULOSIS"
};

(function() {
  const form = document.getElementById("task-form");
  const container = document.getElementById("taskContainer");
  const statusEl = document.getElementById("status");

  // Generate hidden inputs for 3 positions to remove HTML duplication
  const HIDDEN_KEYS = [
    "image_id",
    "image_url",
    "true_label",
    "predicted_label",
    "prob_NORMAL",
    "prob_PNEUMONIA",
    "prob_TUBERCULOSIS"
  ];

  createHiddenFields(form, 3, HIDDEN_KEYS);

  Papa.parse(CSV_URL, {
    download: true, header: true, skipEmptyLines: true,
    complete: (results) => {
      let rows = (results.data || []).filter(r => r[COLS.url]);
      if (rows.length < 3) return showError("CSV has fewer than 3 rows with image_path.");

      const picks = sampleWithoutReplacement(rows, 3).map(r => {
        const path = String(r[COLS.url]).trim();
        const url = path.startsWith("http") ? path : (RAW_BASE + path.replace(/^\/+/, ""));
        const id = (path.split("/").pop() || "").replace(/[^a-zA-Z0-9_.-]/g, "_");
        return {
          id, url,
          true_label: r[COLS.true_label] || "",
          predicted_label: r[COLS.predicted_label] || "",
          prob_NORMAL: r[COLS.prob_NORMAL] || "",
          prob_PNEUMONIA: r[COLS.prob_PNEUMONIA] || "",
          prob_TUBERCULOSIS: r[COLS.prob_TUBERCULOSIS] || ""
        };
      });

      shuffle(picks);

      document.getElementById("randomized_order_json").value =
        JSON.stringify(picks.map((x, i) => ({ position: i+1, id: x.id, url: x.url })));

      picks.forEach((img, idx) => {
        setHidden(idx+1, "image_id", img.id);
        setHidden(idx+1, "image_url", img.url);
        setHidden(idx+1, "true_label", img.true_label);
        setHidden(idx+1, "predicted_label", img.predicted_label);
        setHidden(idx+1, "prob_NORMAL", img.prob_NORMAL);
        setHidden(idx+1, "prob_PNEUMONIA", img.prob_PNEUMONIA);
        setHidden(idx+1, "prob_TUBERCULOSIS", img.prob_TUBERCULOSIS);

        const block = document.createElement("div");
        block.className = "task-block";
        const safeName = escapeName(img.id || ("pos"+(idx+1)));
        block.innerHTML = `
          <h3>Image ${idx + 1}</h3>
          <div class="muted">X-ray ${idx + 1}</div>
          <img class="task-image" src="${escapeHtml(img.url)}" alt="X-ray ${idx+1}" loading="lazy" />

          <table class="probs" aria-label="AI predicted probabilities">
            <thead><tr><th>Class.</th><th>Probability</th></tr></thead>
            <tbody>
              <tr><td>Normal</td><td>${fmtPct(img.prob_NORMAL)}</td></tr>
              <tr><td>Pneumonia</td><td>${fmtPct(img.prob_PNEUMONIA)}</td></tr>
              <tr><td>Tuberculosis</td><td>${fmtPct(img.prob_TUBERCULOSIS)}</td></tr>
            </tbody>
          </table>

          <div class="field-group">
            <label><strong>Diagnosis</strong></label>
            <select name="diagnosis_${safeName}" required>
              <option value="">-- Select a diagnosis --</option>
              <option value="Normal (clear lungs, no visible infection)">Normal (clear lungs, no visible infection)</option>
              <option value="Pneumonia (Parts of the lungs look cloudy/hazy)">Pneumonia (Parts of the lungs look cloudy/hazy)</option>
              <option value="Tuberculosis (Small round spots (nodules) or holes (cavities))">Tuberculosis (Small round spots (nodules) or holes (cavities))</option>
            </select>
          </div>

          <div class="field-group">
            <fieldset>
              <legend>Confidence</legend>
              <label class="radio-row"><input type="radio" name="confidence_${safeName}" value="1" required /> 1 - Not confident</label>
              <label class="radio-row"><input type="radio" name="confidence_${safeName}" value="2" /> 2 - Somewhat confident</label>
              <label class="radio-row"><input type="radio" name="confidence_${safeName}" value="3" /> 3 - Very confident</label>
            </fieldset>
          </div>

          <div class="field-group">
            <label><strong>Justification (optional)</strong></label>
            <textarea name="justification_${safeName}" placeholder="e.g., cloudy opacity in left lung"></textarea>
          </div>
        `;
        container.appendChild(block);
      });
    },
    error: (err) => showError("Failed to fetch/parse CSV: " + err)
  });

  // Submit as URL-encoded (Apps Script-friendly)
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.reportValidity && !form.reportValidity()) return;
    statusEl.textContent = "Submitting…";
    statusEl.className = "status";

    const payload = Object.fromEntries(new FormData(form).entries());
    payload.client_timestamp_iso = new Date().toISOString();

    try {
      const body = new URLSearchParams(payload).toString();
      const res = await fetch(GAS_WEB_APP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body
      });

      let ok = false;
      try { const json = await res.json(); ok = json && json.ok; } catch(_) { ok = res.ok; }
      if (ok) {
        statusEl.textContent = "Thanks! Your responses were recorded.";
        statusEl.className = "status ok";
        form.reset();
      } else {
        statusEl.textContent = "Submit finished, but response not OK. Check the Sheet.";
        statusEl.className = "status err";
      }
    } catch (err) {
      statusEl.textContent = "Submit finished. If this shows as an error, check the Sheet. (" + err.message + ")";
      statusEl.className = "status err";
    }
  });

  // utils
  function setHidden(pos, key, val){ const el = document.getElementById(`shown_${key}_${pos}`); if (el) el.value = val || ""; }
  function createHiddenFields(formEl, count, keys){
    for (let i = 1; i <= count; i++) {
      for (const k of keys) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = `shown_${k}_${i}`;
        input.id = `shown_${k}_${i}`;
        formEl.appendChild(input);
      }
    }
  }
  function shuffle(arr){ for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }
  function sampleWithoutReplacement(arr, k){ const copy = arr.slice(); shuffle(copy); return copy.slice(0, k); }
  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
  function escapeName(s){ return String(s).replace(/[^a-zA-Z0-9_.-]/g, '_'); }
  function showError(msg){ const p = document.createElement('p'); p.className = 'status err'; p.textContent = msg; document.getElementById("taskContainer").appendChild(p); console.error(msg); }
  function fmtPct(v){ const n = Number(v); if (isNaN(n)) return String(v); return (n*100).toFixed(1) + '%'; }
})();
