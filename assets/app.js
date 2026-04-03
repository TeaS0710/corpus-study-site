const FIGURES = [
  ["Brightness distribution", "assets/figures/brightness_histogram.svg"],
  ["Saturation distribution", "assets/figures/saturation_histogram.svg"],
  ["Colorfulness distribution", "assets/figures/colorfulness_histogram.svg"],
  ["Warm balance distribution", "assets/figures/warm_balance_histogram.svg"],
  ["Sharpness vs dynamic range", "assets/figures/sharpness_vs_dynamic_range.svg"],
  ["Saturation vs edge density", "assets/figures/saturation_vs_edge_density.svg"],
  ["Visual center map", "assets/figures/visual_center_map.svg"],
  ["Corpus contact sheet", "assets/figures/contact_sheet.png"],
];

const METRIC_COLUMNS = [
  "file_name",
  "family",
  "orientation",
  "text_present",
  "subject_count",
  "object_count",
  "luminance_mean",
  "dynamic_range",
  "saturation_mean",
  "colorfulness",
  "warm_balance",
  "edge_density",
  "sharpness",
  "symmetry_score",
  "negative_space_ratio",
  "entropy",
];

const METRIC_LABELS = {
  file_name: "Fichier",
  family: "Famille",
  orientation: "Orientation",
  text_present: "Texte",
  subject_count: "Sujets",
  object_count: "Objets",
  luminance_mean: "Lum. moyenne",
  dynamic_range: "Dyn. range",
  saturation_mean: "Saturation",
  colorfulness: "Colorfulness",
  warm_balance: "Warm balance",
  edge_density: "Edge density",
  sharpness: "Sharpness",
  symmetry_score: "Symétrie",
  negative_space_ratio: "Espace négatif",
  entropy: "Entropie",
};

const state = {
  records: [],
  filters: {
    search: "",
    family: "all",
    text: "all",
  },
};

const $ = (selector) => document.querySelector(selector);

function formatNumber(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "n/a";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(Math.abs(value) >= 10 ? 2 : 4).replace(/\.?0+$/, "");
}

function formatValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "n/a";
  if (typeof value === "boolean") return value ? "oui" : "non";
  if (typeof value === "number") return formatNumber(value);
  if (value === null || value === undefined || value === "") return "n/a";
  return String(value);
}

function titleize(key) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function safeEntries(object) {
  return Object.entries(object || {});
}

function average(values) {
  const valid = values.filter((value) => typeof value === "number" && !Number.isNaN(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

async function fetchJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Unable to load ${path}`);
  return response.json();
}

async function fetchText(path) {
  const response = await fetch(path);
  if (!response.ok) return "";
  return response.text();
}

function getEmbeddedData() {
  if (window.__CORPUS_DATA__) return window.__CORPUS_DATA__;
  throw new Error("Données embarquées absentes");
}

function splitParagraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

function parseReportMarkdown(markdown) {
  const lines = String(markdown || "").split("\n");
  const sections = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith("## ")) {
      current = { title: line.slice(3).trim(), lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
  }

  return sections.map((section) => {
    const bullets = [];
    const paragraphs = [];
    let buffer = [];

    for (const rawLine of section.lines) {
      const line = rawLine.trim();
      if (!line) {
        if (buffer.length) {
          paragraphs.push(buffer.join(" ").trim());
          buffer = [];
        }
        continue;
      }
      if (line.startsWith("- ")) {
        if (buffer.length) {
          paragraphs.push(buffer.join(" ").trim());
          buffer = [];
        }
        bullets.push(line.slice(2).trim());
        continue;
      }
      buffer.push(line);
    }

    if (buffer.length) {
      paragraphs.push(buffer.join(" ").trim());
    }

    return { title: section.title, paragraphs, bullets };
  });
}

function buildStatCard(label, value) {
  const fragment = $("#stat-card-template").content.cloneNode(true);
  fragment.querySelector(".stat-label").textContent = label;
  fragment.querySelector(".stat-value").textContent = value;
  return fragment;
}

function renderHeroStats(summary, records) {
  const container = $("#hero-stats");
  container.innerHTML = "";
  const numericMetrics = records.map((record) => record.metrics);
  const stats = [
    ["Images", summary.image_count],
    ["Familles", Object.keys(summary.families || {}).length],
    ["Avec texte", summary.text_image_count],
    ["Sans texte", summary.image_count - summary.text_image_count],
    ["Colorfulness moyenne", formatNumber(summary.mean_colorfulness)],
    ["Sharpness moyenne", formatNumber(average(numericMetrics.map((item) => item.sharpness)))],
  ];
  stats.forEach(([label, value]) => container.appendChild(buildStatCard(label, value)));
}

function renderSummaryPanel(summary, records) {
  const orientations = countBy(records, (record) => record.metrics.orientation);
  const aspectRatios = [...new Set(records.map((record) => formatNumber(record.metrics.aspect_ratio)))];
  $("#summary-panel").innerHTML = `
    <p class="eyebrow">Résumé calculé</p>
    <h3>Corpus et homogénéité</h3>
    <ul class="list">
      <li><span>Images analysées</span><strong>${summary.image_count}</strong></li>
      <li><span>Présence humaine détectée</span><strong>${summary.human_image_count}</strong></li>
      <li><span>Présence de texte</span><strong>${summary.text_image_count}</strong></li>
      <li><span>Brightness moyenne</span><strong>${formatNumber(summary.brightness_mean)}</strong></li>
      <li><span>Saturation moyenne</span><strong>${formatNumber(summary.saturation_mean)}</strong></li>
      <li><span>Ratios observés</span><strong>${aspectRatios.join(" / ")}</strong></li>
      <li><span>Orientations</span><strong>${safeEntries(orientations).map(([key, value]) => `${key}: ${value}`).join(", ") || "n/a"}</strong></li>
    </ul>
  `;
}

function renderFamilyPanel(summary) {
  const families = Object.entries(summary.families || {}).sort((a, b) => b[1] - a[1]);
  $("#family-panel").innerHTML = `
    <p class="eyebrow">Familles</p>
    <h3>Répartition des clusters</h3>
    <ul class="list">
      ${families.map(([name, count]) => `<li><span>${name}</span><strong>${count}</strong></li>`).join("")}
    </ul>
  `;

  const select = $("#family-filter");
  families.forEach(([name]) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    select.appendChild(option);
  });
}

function renderSupportPanel(trends) {
  const supports = trends.support_kinds || [];
  $("#support-panel").innerHTML = `
    <p class="eyebrow">Supports</p>
    <h3>Types de support déclarés</h3>
    <ul class="dense-list">
      ${supports.map(([label, count]) => `<li><span>${label}</span><strong>${count}</strong></li>`).join("")}
    </ul>
  `;
}

function findExtreme(records, metric, mode = "max") {
  const sorted = [...records].filter((record) => typeof record.metrics[metric] === "number")
    .sort((a, b) => mode === "max" ? b.metrics[metric] - a.metrics[metric] : a.metrics[metric] - b.metrics[metric]);
  return sorted[0];
}

function renderExtremesPanel(records) {
  const extremes = [
    ["Sharpness max", findExtreme(records, "sharpness", "max")],
    ["Colorfulness max", findExtreme(records, "colorfulness", "max")],
    ["Dynamic range max", findExtreme(records, "dynamic_range", "max")],
    ["Warm balance max", findExtreme(records, "warm_balance", "max")],
    ["Symétrie max", findExtreme(records, "symmetry_score", "max")],
    ["Espace négatif min", findExtreme(records, "negative_space_ratio", "min")],
  ];
  $("#extremes-panel").innerHTML = `
    <p class="eyebrow">Extrêmes</p>
    <h3>Images remarquables</h3>
    <ul class="dense-list">
      ${extremes.map(([label, record]) => {
        if (!record) return `<li><span>${label}</span><strong>n/a</strong></li>`;
        return `<li><span>${label}</span><strong>${record.baseName}</strong></li>`;
      }).join("")}
    </ul>
  `;
}

function renderFigures() {
  $("#figure-grid").innerHTML = FIGURES.map(([title, src]) => `
    <article class="figure-card">
      <div class="figure-frame">
        <img src="${src}" alt="${title}">
      </div>
      <h3>${title}</h3>
    </article>
  `).join("");
}

function renderKeywordPanel(trends) {
  const keywords = trends.top_keywords || [];
  $("#keyword-panel").innerHTML = `
    <p class="eyebrow">Keywords</p>
    <h3>Mots-clés récurrents</h3>
    <ul class="dense-list">
      ${keywords.map(([label, count]) => `<li><span>${label}</span><strong>${count}</strong></li>`).join("") || "<li><span>n/a</span><strong>0</strong></li>"}
    </ul>
  `;
}

function renderObjectPanel(trends) {
  const objects = trends.top_objects || [];
  $("#object-panel").innerHTML = `
    <p class="eyebrow">Objets</p>
    <h3>Objets saillants</h3>
    <ul class="dense-list">
      ${objects.map(([label, count]) => `<li><span>${label}</span><strong>${count}</strong></li>`).join("") || "<li><span>Aucun objet récurrent exploitable</span><strong>0</strong></li>"}
    </ul>
  `;
}

function renderModelPanel(records) {
  const grouped = countBy(records, (record) => `${record.run.backend} | ${record.run.model}`);
  const vision = countBy(records, (record) => record.run.vision_model);
  const reasoning = countBy(records, (record) => record.run.reasoning_model);
  $("#model-panel").innerHTML = `
    <p class="eyebrow">Pipeline</p>
    <h3>Backend et modèles observés</h3>
    <div class="detail-grid">
      <div class="copy-block">
        <p class="subhead">Backend principal</p>
        <ul class="dense-list">
          ${safeEntries(grouped).map(([label, count]) => `<li><span>${label}</span><strong>${count}</strong></li>`).join("")}
        </ul>
      </div>
      <div class="copy-block">
        <p class="subhead">Vision / reasoning</p>
        <ul class="dense-list">
          ${safeEntries(vision).map(([label, count]) => `<li><span>Vision: ${label}</span><strong>${count}</strong></li>`).join("")}
          ${safeEntries(reasoning).map(([label, count]) => `<li><span>Reasoning: ${label}</span><strong>${count}</strong></li>`).join("")}
        </ul>
      </div>
    </div>
  `;
}

function countBy(records, resolver) {
  return records.reduce((accumulator, record) => {
    const key = resolver(record) || "n/a";
    accumulator[key] = (accumulator[key] || 0) + 1;
    return accumulator;
  }, {});
}

function renderMatrix(records) {
  const head = METRIC_COLUMNS.map((key) => `<th>${METRIC_LABELS[key] || titleize(key)}</th>`).join("");
  const rows = records.map((record) => {
    const data = {
      file_name: record.baseName,
      family: record.family,
      orientation: record.metrics.orientation,
      text_present: record.semantic.text_present,
      subject_count: record.semantic.subject_count,
      object_count: record.semantic.object_count,
      luminance_mean: record.metrics.luminance_mean,
      dynamic_range: record.metrics.dynamic_range,
      saturation_mean: record.metrics.saturation_mean,
      colorfulness: record.metrics.colorfulness,
      warm_balance: record.metrics.warm_balance,
      edge_density: record.metrics.edge_density,
      sharpness: record.metrics.sharpness,
      symmetry_score: record.metrics.symmetry_score,
      negative_space_ratio: record.metrics.negative_space_ratio,
      entropy: record.metrics.entropy,
    };
    return `<tr>${METRIC_COLUMNS.map((key) => `<td>${formatValue(data[key])}</td>`).join("")}</tr>`;
  }).join("");
  $("#matrix-table").innerHTML = `<thead><tr>${head}</tr></thead><tbody>${rows}</tbody>`;
}

function reportMatches(record) {
  const searchHaystack = [
    record.baseName,
    record.family,
    record.semantic.short_title,
    record.semantic.support_kind,
    record.semantic.scene_summary,
    record.semantic.core_reading,
    ...(record.semantic.keywords || []),
    ...(record.semantic.salient_objects || []),
  ].join(" ").toLowerCase();

  if (state.filters.family !== "all" && record.family !== state.filters.family) return false;
  if (state.filters.text !== "all" && String(record.semantic.text_present) !== state.filters.text) return false;
  if (state.filters.search && !searchHaystack.includes(state.filters.search)) return false;
  return true;
}

function renderReports() {
  const records = state.records.filter(reportMatches);
  const container = $("#report-list");
  if (!records.length) {
    container.innerHTML = `<div class="empty-state">Aucun report ne correspond aux filtres actifs.</div>`;
    return;
  }
  container.innerHTML = records.map(renderReportCard).join("");
}

function renderMetricItems(metrics) {
  return Object.entries(metrics).map(([key, value]) => {
    if (Array.isArray(value)) return "";
    return `
      <div class="metric-item">
        <span class="metric-key">${titleize(key)}</span>
        <strong>${formatValue(value)}</strong>
      </div>
    `;
  }).join("");
}

function renderListPills(values) {
  if (!values || !values.length) return `<span class="pill">n/a</span>`;
  return values.map((value) => `<span class="pill">${value}</span>`).join("");
}

function renderPalette(colors) {
  if (!colors || !colors.length) return `<div class="pill-row"><span class="pill">n/a</span></div>`;
  return `
    <div class="palette">
      ${colors.map((color) => `
        <div class="swatch">
          <div class="swatch-color" style="background:${color}"></div>
          <span class="swatch-label">${color}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderPassConfig(passConfigs) {
  const entries = Object.entries(passConfigs || {});
  if (!entries.length) return `<div class="pill-row"><span class="pill">n/a</span></div>`;
  return `
    <div class="metrics-grid">
      ${entries.map(([name, config]) => `
        <div class="metric-panel">
          <p class="subhead">${name}</p>
          ${renderMetricItems(config)}
        </div>
      `).join("")}
    </div>
  `;
}

function renderParagraphs(paragraphs, className = "narrative-paragraph") {
  if (!paragraphs.length) return `<p class="${className}">n/a</p>`;
  return paragraphs.map((paragraph) => `<p class="${className}">${escapeHtml(paragraph)}</p>`).join("");
}

function renderNarrativeBullets(items) {
  if (!items || !items.length) return `<p class="narrative-muted">n/a</p>`;
  return `<ul class="narrative-list">${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReportSections(markdown) {
  const sections = parseReportMarkdown(markdown).filter((section) => section.paragraphs.length || section.bullets.length);
  if (!sections.length) {
    return `<p class="narrative-muted">Aucune section textuelle exploitable dans le markdown source.</p>`;
  }
  return sections.map((section) => `
    <section class="narrative-section">
      <p class="subhead">${escapeHtml(section.title)}</p>
      ${renderParagraphs(section.paragraphs)}
      ${renderNarrativeBullets(section.bullets)}
    </section>
  `).join("");
}

function renderReportCard(record) {
  const metricCopy = { ...record.metrics };
  delete metricCopy.dominant_colors;
  const reportSections = renderReportSections(record.reportMarkdown);
  return `
    <article class="report-card" id="${record.baseName}">
      <div class="report-visual">
        <img src="assets/thumbs/${record.baseName}.jpg" alt="${record.baseName}">
      </div>
      <div class="report-body">
        <div class="report-head">
          <div>
            <p class="eyebrow">${record.family}</p>
            <h3>${record.semantic.short_title || record.baseName}</h3>
            <p class="meta-line">${record.fileName} · ${record.metrics.width_px}×${record.metrics.height_px} · ${record.metrics.orientation}</p>
          </div>
        </div>

        <div class="chips">
          <div class="chip"><span class="metric-key">Support</span><strong>${formatValue(record.semantic.support_kind)}</strong></div>
          <div class="chip"><span class="metric-key">Faithfulness</span><strong>${formatValue(record.semantic.faithfulness_score)}/100</strong></div>
          <div class="chip"><span class="metric-key">Overreach</span><strong>${formatValue(record.semantic.overreach_risk_score)}/100</strong></div>
          <div class="chip"><span class="metric-key">Texte</span><strong>${formatValue(record.semantic.text_present)}</strong></div>
          <div class="chip"><span class="metric-key">Sujets</span><strong>${formatValue(record.semantic.subject_count)}</strong></div>
          <div class="chip"><span class="metric-key">Objets</span><strong>${formatValue(record.semantic.object_count)}</strong></div>
          <div class="chip"><span class="metric-key">Brightness family</span><strong>${formatValue(record.metrics.brightness_family)}</strong></div>
          <div class="chip"><span class="metric-key">Texture family</span><strong>${formatValue(record.metrics.texture_family)}</strong></div>
        </div>

        <div class="detail-grid">
          <div class="copy-block">
            <h4>Lecture éditoriale</h4>
            <div class="narrative-quote">
              ${renderParagraphs([record.semantic.scene_summary], "lead-paragraph")}
            </div>
            ${renderParagraphs([record.semantic.core_reading])}
            <div class="narrative-meta">
              <p class="narrative-label">Support</p>
              <p class="narrative-muted">${escapeHtml(formatValue(record.semantic.support_kind))}</p>
            </div>
            <p class="narrative-label">Keywords</p>
            <div class="pill-row">${renderListPills(record.semantic.keywords)}</div>
            <p class="narrative-label">Objets saillants</p>
            <div class="pill-row">${renderListPills(record.semantic.salient_objects)}</div>
            <p class="narrative-label">Rôles sujets</p>
            <div class="pill-row">${renderListPills(record.semantic.subject_roles)}</div>
            <p class="narrative-label">Axes dominants</p>
            <div class="pill-row">${renderListPills(record.semantic.dominant_axes)}</div>
            <p class="narrative-label">Palette dominante</p>
            ${renderPalette(record.metrics.dominant_colors)}
          </div>

          <div class="metric-panel">
            <h4>Métriques optiques complètes</h4>
            <div class="metrics-grid">${renderMetricItems(metricCopy)}</div>
          </div>
        </div>

        <section class="report-text-panel">
          <div class="report-text-head">
            <div>
              <p class="eyebrow">Texte du report</p>
              <h4>Paragraphes et sections extraits du markdown</h4>
            </div>
            <p class="report-text-note">La matière textuelle du report est réorganisée en paragraphes lisibles avant l’accès au brut.</p>
          </div>
          <div class="narrative-grid">
            ${reportSections}
          </div>
        </section>

        <div class="details-stack">
          <details>
            <summary>Métadonnées de run</summary>
            <div class="metrics-grid">
              ${renderMetricItems({
                backend: record.run.backend,
                api_host: record.run.api_host,
                model: record.run.model,
                vision_model: record.run.vision_model,
                reasoning_model: record.run.reasoning_model,
                requested_model: record.run.requested_model,
                requested_vision_model: record.run.requested_vision_model,
                requested_reasoning_model: record.run.requested_reasoning_model,
                llm_postprocess: record.run.llm_postprocess,
                reliable_mode: record.run.reliable_mode,
                style_register: record.run.style_register,
                sync_timeout: record.run.sync_timeout,
                workers: record.run.workers,
                image_max_dimension: record.run.image_max_dimension,
                image_jpeg_quality: record.run.image_jpeg_quality,
              })}
            </div>
          </details>

          <details>
            <summary>Configs de passes</summary>
            ${renderPassConfig(record.run.pass_configs)}
          </details>

          <details>
            <summary>Notes de résolution modèle</summary>
            <div class="pill-row">${renderListPills(record.run.model_resolution_notes)}</div>
          </details>

          <details>
            <summary>Markdown source du report</summary>
            <pre class="raw-report">${escapeHtml(record.reportMarkdown || "n/a")}</pre>
          </details>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function bindControls() {
  $("#search-input").addEventListener("input", (event) => {
    state.filters.search = event.target.value.trim().toLowerCase();
    renderReports();
  });
  $("#family-filter").addEventListener("change", (event) => {
    state.filters.family = event.target.value;
    renderReports();
  });
  $("#text-filter").addEventListener("change", (event) => {
    state.filters.text = event.target.value;
    renderReports();
  });
}

async function init() {
  try {
    const embedded = getEmbeddedData();
    const familyData = { summary: embedded.summary };
    const trendData = embedded.trends;
    const records = embedded.records || [];
    state.records = records;

    renderHeroStats(familyData.summary, records);
    renderSummaryPanel(familyData.summary, records);
    renderFamilyPanel(familyData.summary);
    renderSupportPanel(trendData);
    renderExtremesPanel(records);
    renderFigures();
    renderKeywordPanel(trendData);
    renderObjectPanel(trendData);
    renderModelPanel(records);
    renderMatrix(records);
    renderReports();
    bindControls();
  } catch (error) {
    $("#report-list").innerHTML = `<div class="empty-state">Chargement impossible: ${error.message}</div>`;
  }
}

init();
