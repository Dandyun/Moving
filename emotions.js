(() => {
  "use strict";

  const EMOTIONS = [
    "Joy",
    "Trust",
    "Fear",
    "Surprise",
    "Sadness",
    "Disgust",
    "Anger",
    "Anticipation"
  ];

  const EMOTION_COLORS = {
    Joy: "#f6c744",
    Trust: "#6dbb4b",
    Fear: "#1c9d50",
    Surprise: "#39b7df",
    Sadness: "#2d5daa",
    Disgust: "#9b5aa5",
    Anger: "#ed2f32",
    Anticipation: "#f36f3f"
  };

  const COMPARISON_STYLES = [
    { color: "#ffffff", dash: "none", opacity: 1 },
    { color: "#d8d8d8", dash: "12 7", opacity: .95 },
    { color: "#b8b8b8", dash: "3 6", opacity: .92 },
    { color: "#ffffff", dash: "16 5 3 5", opacity: .82 },
    { color: "#9a9a9a", dash: "8 8", opacity: .9 },
    { color: "#d0d0d0", dash: "2 4 10 4", opacity: .86 }
  ];

  const RADAR_MAX = .75;

  const FILTER_CONFIG = [
    { key: "country", id: "country-filter", label: "All countries" },
    { key: "city", id: "city-filter", label: "All cities" },
    { key: "place_type", id: "place-filter", label: "All place types" },
    { key: "with_group", id: "group-filter", label: "All groups" },
    { key: "subject_type", id: "subject-filter", label: "All subjects" },
    { key: "people_visible", id: "people-filter", label: "All people" }
  ];

  const state = {
    allData: [],
    filters: Object.fromEntries(FILTER_CONFIG.map((item) => [item.key, "all"])),
    selectedEmotion: null,
    selectedPhotoId: null,
    comparisons: []
  };

  const elements = {
    status: document.querySelector("#data-status"),
    filteredCount: document.querySelector("#filtered-count"),
    resetFilters: document.querySelector("#reset-filters"),
    filterButton: document.querySelector("#global-filter-button"),
    filterPanel: document.querySelector("#global-filter-drawer"),
    closeFilter: document.querySelector("#close-global-filter"),
    clearEmotion: document.querySelector("#clear-emotion"),
    selectedEmotionStrip: document.querySelector("#selected-emotion-strip"),
    selectedEmotionName: document.querySelector("#selected-emotion-name"),
    gallerySection: document.querySelector("#gallery-section"),
    gallery: document.querySelector("#photo-gallery"),
    galleryCaption: document.querySelector("#gallery-caption"),
    timelineCount: document.querySelector("#timeline-count"),
    timelineFilterLabel: document.querySelector("#timeline-filter-label"),
    timelineEmpty: document.querySelector("#timeline-empty"),
    tooltip: document.querySelector("#tooltip"),
    compareDimension: document.querySelector("#compare-dimension"),
    compareValue: document.querySelector("#compare-value"),
    addComparison: document.querySelector("#add-comparison"),
    comparisonLegend: document.querySelector("#comparison-legend"),
    detailImageWrap: document.querySelector(".detail-image-wrap"),
    detailImage: document.querySelector("#detail-image"),
    detailPlaceholder: document.querySelector("#detail-placeholder"),
    detailPhotoId: document.querySelector("#detail-photo-id"),
    detailDate: document.querySelector("#detail-date"),
    detailLocation: document.querySelector("#detail-location"),
    detailPlace: document.querySelector("#detail-place"),
    detailGroup: document.querySelector("#detail-group"),
    detailSubject: document.querySelector("#detail-subject"),
    detailPeople: document.querySelector("#detail-people"),
    detailEmotion: document.querySelector("#detail-emotion"),
    detailScore: document.querySelector("#detail-score")
  };

  FILTER_CONFIG.forEach((item) => {
    elements[item.key] = document.querySelector(`#${item.id}`);
  });

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    document.querySelector(".emotions-page").appendChild(elements.filterPanel);
    bindEvents();
    loadData();
  }

  function setGlobalFilterOpen(open) {
    elements.filterPanel.classList.toggle("is-open", open);
    elements.filterPanel.setAttribute("aria-hidden", String(!open));
    elements.filterButton.setAttribute("aria-expanded", String(open));
  }

  function loadData() {
    // The dataset is embedded in photos-data.js so the site works even when
    // index.html is opened directly with file://. No CSV fetch is required.
    if (Array.isArray(window.PHOTO_DATA)) {
      processRows(window.PHOTO_DATA, "embedded current CSV");
      return;
    }

    elements.status.textContent = "Data could not be loaded";
    console.error("MOVE: photos-data.js was not loaded.");
  }

  function processRows(rows, sourceLabel) {
    state.allData = rows.map(cleanRow).filter(Boolean).sort((a, b) => a.datetime - b.datetime);
    console.log(`MOVE: loaded ${state.allData.length} photographs from ${sourceLabel}.`);
    console.table(state.allData.slice(0, 8));

    elements.status.textContent = `${state.allData.length.toLocaleString()} photographs loaded`;
    refreshDependentFilters();
    updateCompareValues();
    renderAll();
  }

  function cleanRow(raw, index) {
    const row = Object.fromEntries(
      Object.entries(raw || {}).map(([key, value]) => [
        String(key).trim(),
        typeof value === "string" ? value.trim() : value
      ])
    );

    const photoId = text(row.photo_id ?? row.Photo_id);
    const filename = text(row.filename ?? row.Filename);
    const datetime = parseDate(row.datetime ?? row.Datetime);

    if (!photoId || !filename || !datetime) {
      if (Object.values(row).some((value) => text(value))) {
        console.warn(`MOVE: skipped row ${index + 2}; missing photo id, filename, or datetime.`, row);
      }
      return null;
    }

    return {
      photo_id: photoId,
      filename,
      datetime,
      country: normalizeCountry(text(row.country ?? row.Country, "Unspecified")),
      city: text(row.city ?? row.City, "Unspecified"),
      place_type: text(row.place_type ?? row["Place Type"], "Unspecified"),
      with_group: text(row.with_group ?? row["With Group"], "Unspecified"),
      subject_type: text(row.subject_type ?? row["Subject Type"], "Unspecified"),
      people_visible: text(row.people_visible ?? row["People Visible"], "Unspecified"),
      emotion: normalizeEmotion(text(row.emotion ?? row.Emotion)),
      emotion_score: parseScore(row.emotion_score ?? row.Value)
    };
  }

  function normalizeCountry(value) {
    if (/^(us|usa|united states|united states of america)$/i.test(value)) return "USA";
    if (/^(south korea|republic of korea)$/i.test(value)) return "Korea";
    return value;
  }

  function normalizeEmotion(value) {
    const match = EMOTIONS.find((emotion) => emotion.toLowerCase() === value.toLowerCase());
    if (match) return match;
    if (value.toLowerCase() === "neutral") return "Neutral";
    return value || "Unspecified";
  }

  function text(value, fallback = "") {
    if (value === null || value === undefined) return fallback;
    const cleaned = String(value).trim();
    return cleaned || fallback;
  }

  function parseDate(value) {
    const raw = text(value);
    if (!raw) return null;
    const normalized = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function parseScore(value) {
    const raw = text(value);
    if (!raw) return null;
    const number = Number(raw);
    return Number.isFinite(number) ? Math.max(-5, Math.min(5, number)) : null;
  }

  function bindEvents() {
    elements.filterButton.addEventListener("click", () => setGlobalFilterOpen(true));
    elements.closeFilter.addEventListener("click", () => setGlobalFilterOpen(false));

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && elements.filterPanel.classList.contains("is-open")) {
        setGlobalFilterOpen(false);
      }
    });

    FILTER_CONFIG.forEach(({ key }) => {
      elements[key].addEventListener("change", (event) => {
        state.filters[key] = event.target.value;

        // Country → City hierarchy: changing country invalidates an impossible city.
        if (key === "country") {
          const allowedCities = new Set(
            state.allData
              .filter((d) => state.filters.country === "all" || d.country === state.filters.country)
              .map((d) => d.city)
          );
          if (state.filters.city !== "all" && !allowedCities.has(state.filters.city)) {
            state.filters.city = "all";
          }
        }

        state.selectedPhotoId = null;
        refreshDependentFilters();
        renderAll();
      });
    });

    elements.resetFilters.addEventListener("click", () => {
      FILTER_CONFIG.forEach(({ key }) => { state.filters[key] = "all"; });
      state.selectedEmotion = null;
      state.selectedPhotoId = null;
      refreshDependentFilters();
      renderAll();
    });

    elements.clearEmotion.addEventListener("click", () => {
      state.selectedEmotion = null;
      state.selectedPhotoId = null;
      renderAll();
    });

    elements.compareDimension.addEventListener("change", updateCompareValues);

    elements.addComparison.addEventListener("click", () => {
      const dimension = elements.compareDimension.value;
      const value = elements.compareValue.value;
      if (!value) return;

      const id = `${dimension}:${value}`;
      if (state.comparisons.some((item) => item.id === id)) return;
      if (state.comparisons.length >= COMPARISON_STYLES.length) {
        alert(`You can compare up to ${COMPARISON_STYLES.length} filters at once.`);
        return;
      }

      state.comparisons.push({ id, dimension, value });
      renderComparison();
    });

    window.addEventListener("resize", debounce(() => {
      if (!state.allData.length) return;
      drawEmotionBubbles();
      drawEmotionBars();
      drawComparisonRadar();
      drawTimeline();
    }, 180));
  }

  function refreshDependentFilters() {
    FILTER_CONFIG.forEach((config) => {
      const select = elements[config.key];
      const current = state.filters[config.key];

      // Build available choices from rows that already satisfy every OTHER filter.
      // City is additionally constrained by country, so impossible country/city
      // combinations can never be selected.
      const candidateRows = state.allData.filter((row) => {
        return FILTER_CONFIG.every(({ key }) => {
          if (key === config.key) return true;
          const selected = state.filters[key];
          return selected === "all" || row[key] === selected;
        });
      });

      const values = unique(candidateRows.map((row) => row[config.key]));
      const validCurrent = current === "all" || values.includes(current);
      if (!validCurrent) state.filters[config.key] = "all";

      select.innerHTML = "";
      const all = document.createElement("option");
      all.value = "all";
      all.textContent = config.label;
      select.appendChild(all);

      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });

      select.value = state.filters[config.key];
    });
  }

  function unique(values) {
    return [...new Set(values.filter((value) => value && value !== "Unspecified"))]
      .sort((a, b) => a.localeCompare(b));
  }

  function filteredRows({ includeSelectedEmotion = false } = {}) {
    return state.allData.filter((row) => {
      const matchesFilters = FILTER_CONFIG.every(({ key }) => {
        const selected = state.filters[key];
        return selected === "all" || row[key] === selected;
      });

      if (!matchesFilters) return false;
      if (includeSelectedEmotion && state.selectedEmotion) return row.emotion === state.selectedEmotion;
      return true;
    });
  }

  function annotatedRows(rows) {
    return rows.filter((row) => EMOTIONS.includes(row.emotion) && row.emotion_score !== null);
  }

  function emotionSummary(rows) {
    const valid = annotatedRows(rows);
    const counts = Object.fromEntries(EMOTIONS.map((emotion) => [emotion, 0]));
    valid.forEach((row) => { counts[row.emotion] += 1; });
    const total = d3.sum(Object.values(counts));

    return EMOTIONS.map((emotion) => ({
      emotion,
      count: counts[emotion],
      percent: total ? counts[emotion] / total : 0
    }));
  }

  function renderAll() {
    const baseRows = filteredRows();
    elements.filteredCount.textContent = baseRows.length.toLocaleString();

    drawEmotionBubbles();
    drawEmotionBars();
    renderGallery();
    drawTimeline();
    updateSelectedEmotionUI();
    updateTimelineFilterLabel();
  }

  function emotionColor(emotion) {
    return EMOTION_COLORS[emotion] || "#999";
  }

  // ---------------------------------------------------------------------------
  // 01. Emotion bubbles — intentionally irregular, poster-like composition.
  // ---------------------------------------------------------------------------
  function drawEmotionBubbles() {
    const svg = d3.select("#emotion-bubbles");
    const node = svg.node();
    const width = Math.max(520, node.clientWidth || 720);
    const height = 620;
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const summary = emotionSummary(filteredRows());
    const maxCount = d3.max(summary, (d) => d.count) || 1;
    const radius = d3.scaleSqrt().domain([0, maxCount]).range([18, Math.min(116, width * .16)]);

    const layout = {
      Joy: [0.20, 0.27],
      Trust: [0.52, 0.42],
      Fear: [0.73, 0.71],
      Surprise: [0.78, 0.25],
      Sadness: [0.38, 0.78],
      Disgust: [0.14, 0.72],
      Anger: [0.63, 0.64],
      Anticipation: [0.31, 0.54]
    };

    const data = summary.map((item) => ({
      ...item,
      x: width * layout[item.emotion][0],
      y: height * layout[item.emotion][1],
      r: item.count === 0 ? 18 : radius(item.count)
    }));

    // A light collision pass keeps the irregular placement while preventing overlap.
    const sim = d3.forceSimulation(data)
      .force("x", d3.forceX((d) => width * layout[d.emotion][0]).strength(.26))
      .force("y", d3.forceY((d) => height * layout[d.emotion][1]).strength(.26))
      .force("collide", d3.forceCollide((d) => d.r + 12).iterations(2))
      .stop();
    for (let i = 0; i < 180; i += 1) sim.tick();

    const groups = svg.selectAll(".emotion-bubble-group")
      .data(data, (d) => d.emotion)
      .join("g")
      .attr("class", (d) => `emotion-bubble-group${state.selectedEmotion === d.emotion ? " is-selected" : ""}`)
      .attr("transform", (d) => `translate(${clamp(d.x, d.r + 8, width - d.r - 8)},${clamp(d.y, d.r + 8, height - d.r - 8)})`)
      .on("click", () => {})
      .on("mouseenter", (event, d) => showTooltip(event, bubbleTooltip(d)))
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip);

    groups.append("circle")
      .attr("class", (d) => d.count === 0 ? "emotion-bubble bubble-zero" : "emotion-bubble")
      .attr("r", (d) => d.r)
      .attr("fill", (d) => d.count === 0 ? null : emotionColor(d.emotion))
      .attr("opacity", (d) => d.count === 0 ? 1 : .94);

    groups.append("text")
      .attr("class", "bubble-count")
      .attr("y", (d) => d.r > 38 ? -5 : 3)
      .style("display", (d) => d.r > 31 ? null : "none")
      .text((d) => d.count);

    groups.append("text")
      .attr("class", "bubble-name")
      .attr("y", (d) => d.r > 38 ? 17 : 4)
      .text((d) => d.emotion);

    groups.filter((d) => d.r > 52)
      .append("text")
      .attr("class", "bubble-percent")
      .attr("y", 34)
      .text((d) => `${Math.round(d.percent * 100)}%`);
  }

  function bubbleTooltip(d) {
    return `<strong>${d.emotion}</strong>${d.count} photographs<br><span class="tooltip-muted">${Math.round(d.percent * 100)}% of annotated photographs in this filter</span>`;
  }

  // ---------------------------------------------------------------------------
  // Matching horizontal bar model. D3 automatically changes the x-axis domain
  // and tick interval according to the largest filtered count.
  // ---------------------------------------------------------------------------
  function drawEmotionBars() {
    const svg = d3.select("#emotion-bars");
    const node = svg.node();
    const width = Math.max(420, node.clientWidth || 520);
    const height = 620;
    const margin = { top: 56, right: 42, bottom: 48, left: 112 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const summary = emotionSummary(filteredRows());
    const maxCount = d3.max(summary, (d) => d.count) || 1;
    const axisMax = niceAxisMaximum(maxCount);

    const x = d3.scaleLinear().domain([0, axisMax]).range([margin.left, width - margin.right]);
    const y = d3.scaleBand().domain(EMOTIONS).range([margin.top, height - margin.bottom]).padding(.32);

    svg.append("g")
      .attr("class", "bar-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(dynamicTickCount(axisMax)).tickFormat(d3.format("d")).tickSizeOuter(0));

    const rows = svg.selectAll(".bar-row")
      .data(summary)
      .join("g")
      .attr("class", (d) => `bar-row${state.selectedEmotion === d.emotion ? " is-selected" : ""}`)
      .on("click", () => {})
      .on("mouseenter", (event, d) => showTooltip(event, bubbleTooltip(d)))
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip);

    rows.append("text")
      .attr("class", "bar-label")
      .attr("x", margin.left - 12)
      .attr("y", (d) => y(d.emotion) + y.bandwidth() / 2 + 4)
      .attr("text-anchor", "end")
      .text((d) => d.emotion);

    rows.append("rect")
      .attr("class", "bar-bg")
      .attr("x", margin.left)
      .attr("y", (d) => y(d.emotion))
      .attr("width", width - margin.right - margin.left)
      .attr("height", y.bandwidth());

    rows.append("rect")
      .attr("class", "emotion-bar")
      .attr("x", margin.left)
      .attr("y", (d) => y(d.emotion))
      .attr("width", (d) => Math.max(0, x(d.count) - margin.left))
      .attr("height", y.bandwidth())
      .attr("fill", (d) => emotionColor(d.emotion));

    rows.append("text")
      .attr("class", "bar-count-label")
      .attr("x", (d) => Math.min(width - margin.right + 5, x(d.count) + 7))
      .attr("y", (d) => y(d.emotion) + y.bandwidth() / 2 + 4)
      .text((d) => d.count);
  }

  function niceAxisMaximum(max) {
    if (max <= 5) return 5;
    if (max <= 10) return 10;
    if (max <= 20) return 20;
    if (max <= 50) return Math.ceil(max / 10) * 10;
    if (max <= 100) return Math.ceil(max / 20) * 20;
    return Math.ceil(max / 50) * 50;
  }

  function dynamicTickCount(max) {
    if (max <= 5) return 5;
    if (max <= 20) return 4;
    return 5;
  }

  function selectEmotion(emotion) {
    state.selectedEmotion = state.selectedEmotion === emotion ? null : emotion;
    state.selectedPhotoId = null;
    renderAll();
    if (state.selectedEmotion) {
      setTimeout(() => document.querySelector("#gallery-section")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }
  }

  function updateSelectedEmotionUI() {
    const active = Boolean(state.selectedEmotion);
    elements.selectedEmotionStrip.hidden = !active;
    elements.gallerySection.hidden = !active;
    if (active) elements.selectedEmotionName.textContent = state.selectedEmotion;
  }

  function renderGallery() {
    if (!state.selectedEmotion) {
      elements.gallery.innerHTML = "";
      return;
    }

    const rows = filteredRows({ includeSelectedEmotion: true });
    elements.galleryCaption.textContent = `${rows.length} photographs · ${state.selectedEmotion}`;
    elements.gallery.innerHTML = "";

    if (!rows.length) {
      elements.gallery.innerHTML = '<p class="empty-copy">No photographs match this emotion and filter combination.</p>';
      return;
    }

    rows.forEach((row) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "gallery-card";
      card.setAttribute("aria-label", `Open ${row.photo_id}`);

      const img = document.createElement("img");
      img.src = imagePath(row.filename);
      img.alt = `${row.photo_id}, ${row.emotion}`;
      img.loading = "lazy";

      const fallback = document.createElement("div");
      fallback.className = "fallback";
      fallback.innerHTML = `${escapeHtml(row.photo_id)}<br>${escapeHtml(row.filename)}`;
      img.addEventListener("error", () => img.replaceWith(fallback));

      const meta = document.createElement("div");
      meta.className = "gallery-meta";
      meta.textContent = `${formatDate(row.datetime)} · ${formatScore(row.emotion_score)}`;

      card.append(img, meta);
      card.addEventListener("click", () => {
        selectPhoto(row);
        document.querySelector("#photo-detail")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      elements.gallery.appendChild(card);
    });
  }

  // ---------------------------------------------------------------------------
  // 02. Comparison radar — add any number of filter layers (up to color limit).
  // ---------------------------------------------------------------------------
  function updateCompareValues() {
    if (!state.allData.length) return;
    const dimension = elements.compareDimension.value;
    const values = unique(state.allData.map((row) => row[dimension]));
    elements.compareValue.innerHTML = "";
    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      elements.compareValue.appendChild(option);
    });
  }

  function renderComparison() {
    renderComparisonLegend();
    drawComparisonRadar();
  }

  function renderComparisonLegend() {
    elements.comparisonLegend.innerHTML = "";
    const legendTitle = document.createElement("p");
    legendTitle.className = "comparison-legend-title";
    legendTitle.textContent = "Filter layers · line style = filter";
    elements.comparisonLegend.appendChild(legendTitle);

    if (!state.comparisons.length) {
      drawEmptyComparisonRadar();
      elements.comparisonLegend.insertAdjacentHTML("beforeend", '<p class="empty-copy">Add a filter to begin comparing emotions.</p>');
      return;
    }

    state.comparisons.forEach((comparison, index) => {
      const rows = state.allData.filter((row) => row[comparison.dimension] === comparison.value);
      const annotated = annotatedRows(rows);
      const item = document.createElement("div");
      item.className = "comparison-item";
      const comparisonStyle = COMPARISON_STYLES[index];
      item.innerHTML = `
        <svg class="comparison-line-swatch" viewBox="0 0 34 12" aria-hidden="true"><line x1="1" y1="6" x2="33" y2="6" stroke="${comparisonStyle.color}" stroke-width="2" stroke-dasharray="${comparisonStyle.dash}" opacity="${comparisonStyle.opacity}"></line></svg>
        <div>
          <span class="comparison-name">${escapeHtml(comparison.value)}</span>
          <span class="comparison-sub">${humanizeKey(comparison.dimension)} · ${annotated.length} annotated photos</span>
        </div>
        <button class="remove-comparison" type="button" aria-label="Remove ${escapeHtml(comparison.value)}">×</button>
      `;
      item.querySelector("button").addEventListener("click", () => {
        state.comparisons = state.comparisons.filter((entry) => entry.id !== comparison.id);
        renderComparison();
      });
      elements.comparisonLegend.appendChild(item);
    });
  }


  function drawEmptyComparisonRadar() {
    const svg = d3.select("#comparison-radar");
    if (svg.empty()) return;

    const node = svg.node();
    const rect = node.getBoundingClientRect();
    const width = Math.max(520, rect.width || 760);
    const height = Math.max(620, rect.height || 720);

    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const cx = width * 0.47;
    const cy = height * 0.52;
    const radius = Math.min(width, height) * 0.40;
    const levels = [0.25, 0.5, 0.75];
    const emotions = EMOTIONS;

    levels.forEach(level => {
      const points = emotions.map((_, i) => {
        const angle = -Math.PI / 2 + i * (Math.PI * 2 / emotions.length);
        return [
          cx + Math.cos(angle) * radius * (level / RADAR_MAX),
          cy + Math.sin(angle) * radius * (level / RADAR_MAX)
        ];
      });
      points.push(points[0]);
      svg.append("path")
        .attr("class", "radar-empty-guide")
        .attr("d", d3.line()(points));
    });

    emotions.forEach((emotion, i) => {
      const angle = -Math.PI / 2 + i * (Math.PI * 2 / emotions.length);
      const x2 = cx + Math.cos(angle) * radius;
      const y2 = cy + Math.sin(angle) * radius;

      svg.append("line")
        .attr("class", "radar-empty-axis")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", x2).attr("y2", y2);

      const lx = cx + Math.cos(angle) * (radius + 28);
      const ly = cy + Math.sin(angle) * (radius + 28);

      svg.append("text")
        .attr("class", "radar-empty-label")
        .attr("x", lx)
        .attr("y", ly)
        .attr("dy", "0.35em")
        .text(emotion);
    });
  }

  function drawComparisonRadar() {
    const svg = d3.select("#comparison-radar");
    const node = svg.node();
    const width = Math.max(520, node.clientWidth || 760);
    const height = Math.max(720, node.clientHeight || 720);
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const cx = width / 2;
    const cy = height / 2 + 10;
    const radius = Math.min(width, height) * .40;
    const levels = [0.25, 0.5, 0.75];
    const angle = (index) => -Math.PI / 2 + index * (Math.PI * 2 / EMOTIONS.length);

    levels.forEach((level) => {
      const points = EMOTIONS.map((_, index) => polarPoint(cx, cy, radius * (level / RADAR_MAX), angle(index)));
      svg.append("polygon")
        .attr("class", "radar-grid")
        .attr("points", points.map((p) => p.join(",")).join(" "));

      svg.append("text")
        .attr("class", "radar-level-label")
        .attr("x", cx + 5)
        .attr("y", cy - radius * level + 12)
        .text(`${Math.round(level * 100)}%`);
    });

    EMOTIONS.forEach((emotion, index) => {
      const end = polarPoint(cx, cy, radius, angle(index));
      const label = polarPoint(cx, cy, radius + 34, angle(index));
      svg.append("line")
        .attr("class", "radar-axis-line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", end[0]).attr("y2", end[1]);

      svg.append("text")
        .attr("class", "radar-label")
        .attr("x", label[0])
        .attr("y", label[1] + 4)
        .text(emotion);
    });

    state.comparisons.forEach((comparison, comparisonIndex) => {
      const rows = state.allData.filter((row) => row[comparison.dimension] === comparison.value);
      const summary = emotionSummary(rows);
      const points = summary.map((item, index) => {
        return polarPoint(cx, cy, radius * Math.min(item.percent / RADAR_MAX, 1), angle(index));
      });
      const comparisonStyle = COMPARISON_STYLES[comparisonIndex];

      svg.append("polygon")
        .attr("class", "radar-area")
        .attr("points", points.map((p) => p.join(",")).join(" "))
        .style("fill", comparisonStyle.color)
        .style("fill-opacity", .035)
        .style("stroke", comparisonStyle.color)
        .style("stroke-opacity", comparisonStyle.opacity)
        .style("stroke-dasharray", comparisonStyle.dash);

      svg.selectAll(`.radar-point-${comparisonIndex}`)
        .data(points)
        .join("circle")
        .attr("class", "radar-point")
        .attr("cx", (d) => d[0])
        .attr("cy", (d) => d[1])
        .attr("r", 4)
        .style("fill", "#000")
        .style("stroke", comparisonStyle.color)
        .style("stroke-opacity", comparisonStyle.opacity);
    });
  }

  function polarPoint(cx, cy, r, angle) {
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  }

  // ---------------------------------------------------------------------------
  // 03. Emotional timeline. Current filters + optional selected emotion apply.
  // Clicking a point opens the actual image and all metadata below the chart.
  // ---------------------------------------------------------------------------
  function drawTimeline() {
    const rows = filteredRows({ includeSelectedEmotion: true })
      .filter((row) => row.emotion_score !== null)
      .sort((a, b) => a.datetime - b.datetime);

    elements.timelineCount.textContent = rows.length.toLocaleString();

    const svg = d3.select("#timeline-chart");
    const node = svg.node();
    const width = Math.max(720, node.clientWidth || 1200);
    const height = 560;
    const margin = { top: 34, right: 28, bottom: 56, left: 50 };
    svg.attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    elements.timelineEmpty.hidden = rows.length > 0;
    if (!rows.length) return;

    let extent = d3.extent(rows, (d) => d.datetime);
    if (+extent[0] === +extent[1]) {
      extent = [d3.timeDay.offset(extent[0], -1), d3.timeDay.offset(extent[1], 1)];
    }

    const x = d3.scaleTime().domain(extent).range([margin.left, width - margin.right]);
    const y = d3.scaleLinear().domain([-5, 5]).range([height - margin.bottom, margin.top]);

    [-5, -3, -1, 0, 1, 3, 5].forEach((value) => {
      svg.append("line")
        .attr("class", value === 0 ? "timeline-zero" : "timeline-grid")
        .attr("x1", margin.left)
        .attr("x2", width - margin.right)
        .attr("y1", y(value))
        .attr("y2", y(value));
    });

    svg.append("g")
      .attr("class", "timeline-axis")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(Math.min(8, Math.floor(width / 140))).tickSizeOuter(0));

    svg.append("g")
      .attr("class", "timeline-axis")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).tickValues([-5, -3, -1, 0, 1, 3, 5]).tickSizeOuter(0));

    if (rows.length > 1) {
      const movementLine = d3.line()
        .x((d) => x(d.datetime))
        .y((d) => y(d.emotion_score))
        .curve(d3.curveLinear);

      svg.append("path")
        .datum(rows)
        .attr("class", "timeline-connection")
        .attr("d", movementLine);
    }

    svg.selectAll(".photo-point")
      .data(rows, (d) => d.photo_id)
      .join("circle")
      .attr("class", (d) => `photo-point${state.selectedPhotoId === d.photo_id ? " is-selected" : ""}`)
      .attr("cx", (d) => x(d.datetime))
      .attr("cy", (d) => y(d.emotion_score))
      .attr("r", 6)
      .attr("fill", (d) => emotionColor(d.emotion))
      .on("mouseenter", (event, d) => showTooltip(event, photoTooltip(d)))
      .on("mousemove", moveTooltip)
      .on("mouseleave", hideTooltip)
      .on("click", (_, d) => {
        selectPhoto(d);
        drawTimeline();
        window.dispatchEvent(new CustomEvent("move-horizontal-to", { detail: { id: "photo-detail-panel" } }));
      });
  }

  function updateTimelineFilterLabel() {
    const active = FILTER_CONFIG
      .map(({ key }) => state.filters[key] === "all" ? null : state.filters[key])
      .filter(Boolean);
    if (state.selectedEmotion) active.push(state.selectedEmotion);
    elements.timelineFilterLabel.textContent = active.length ? active.join(" · ") : "All filters";
  }

  function selectPhoto(row) {
    state.selectedPhotoId = row.photo_id;
    elements.detailImageWrap.style.setProperty("--selected-emotion-color", emotionColor(row.emotion));
    elements.detailPhotoId.textContent = row.photo_id;
    elements.detailDate.textContent = formatDateTime(row.datetime);
    elements.detailLocation.textContent = [row.city, row.country].filter(Boolean).join(", ");
    elements.detailPlace.textContent = row.place_type;
    elements.detailGroup.textContent = row.with_group;
    elements.detailSubject.textContent = row.subject_type;
    elements.detailPeople.textContent = row.people_visible;
    elements.detailEmotion.textContent = row.emotion || "Unspecified";
    elements.detailScore.textContent = formatScore(row.emotion_score);

    elements.detailPlaceholder.hidden = true;
    elements.detailImage.hidden = false;
    elements.detailImage.src = imagePath(row.filename);
    elements.detailImage.alt = `${row.photo_id} — ${row.city}, ${row.emotion}`;
    elements.detailImage.onerror = () => {
      elements.detailImage.hidden = true;
      elements.detailPlaceholder.hidden = false;
      elements.detailPlaceholder.textContent = `Image not found. Put ${row.filename} inside the images folder.`;
    };
  }

  // ---------------------------------------------------------------------------
  // 04. Physical movement hierarchy.
  // Country order follows the first photographed occurrence in the archive.
  // City nodes branch above/below each country. Hover replaces node fill with an
  // emotion pie sorted from the largest slice to the smallest.
  // ---------------------------------------------------------------------------
  function drawPhysicalMap() {
    const svg = d3.select("#physical-map");
    const rows = state.allData.filter((row) => row.country !== "Unspecified" && row.city !== "Unspecified");
    if (!rows.length) return;

    const countries = d3.rollups(
      rows,
      (countryRows) => ({
        rows: countryRows,
        firstDate: d3.min(countryRows, (d) => d.datetime),
        cities: d3.rollups(
          countryRows,
          (cityRows) => ({ rows: cityRows, firstDate: d3.min(cityRows, (d) => d.datetime) }),
          (d) => d.city
        ).map(([name, value]) => ({ name, ...value })).sort((a, b) => a.firstDate - b.firstDate)
      }),
      (d) => d.country
    ).map(([name, value]) => ({ name, ...value })).sort((a, b) => a.firstDate - b.firstDate);

    const countryGap = 420;
    const cityGap = 112;
    const sidePadding = 180;
    const width = Math.max(1300, sidePadding * 2 + countries.reduce((sum, country) => {
      return sum + Math.max(countryGap, (country.cities.length + 1) * cityGap);
    }, 0));
    const height = 620;
    const baselineY = 310;

    svg.attr("viewBox", `0 0 ${width} ${height}`).attr("width", width).attr("height", height);
    svg.selectAll("*").remove();

    const countryPositions = [];
    let cursor = sidePadding;
    countries.forEach((country) => {
      const span = Math.max(countryGap, (country.cities.length + 1) * cityGap);
      countryPositions.push({ ...country, x: cursor + span / 2, y: baselineY, span });
      cursor += span;
    });

    for (let i = 0; i < countryPositions.length - 1; i += 1) {
      svg.append("line")
        .attr("class", "country-line")
        .attr("x1", countryPositions[i].x)
        .attr("x2", countryPositions[i + 1].x)
        .attr("y1", baselineY)
        .attr("y2", baselineY);
    }

    const maxCountryCount = d3.max(countryPositions, (d) => d.rows.length) || 1;
    const countryRadius = d3.scaleSqrt().domain([1, maxCountryCount]).range([34, 58]);
    const maxCityCount = d3.max(countryPositions.flatMap((d) => d.cities), (d) => d.rows.length) || 1;
    const cityRadius = d3.scaleSqrt().domain([1, maxCityCount]).range([18, 38]);

    countryPositions.forEach((country, countryIndex) => {
      const cityCount = country.cities.length;
      const offsets = centeredOffsets(cityCount, cityGap);

      country.cities.forEach((city, cityIndex) => {
        const above = cityIndex % 2 === 0;
        const vertical = 120 + (cityIndex % 3) * 30;
        city.x = country.x + offsets[cityIndex];
        city.y = baselineY + (above ? -vertical : vertical);
        city.r = cityRadius(city.rows.length);

        svg.append("line")
          .attr("class", "city-branch")
          .attr("x1", country.x)
          .attr("y1", baselineY)
          .attr("x2", city.x)
          .attr("y2", city.y);
      });

      country.r = countryRadius(country.rows.length);
      drawPlaceNode(svg, country, "country", countryIndex);
      country.cities.forEach((city, cityIndex) => drawPlaceNode(svg, city, "city", cityIndex));
    });
  }

  function centeredOffsets(count, gap) {
    if (count <= 1) return [0];
    const center = (count - 1) / 2;
    return d3.range(count).map((index) => (index - center) * gap);
  }

  function drawPlaceNode(svg, datum, type) {
    const group = svg.append("g")
      .datum(datum)
      .attr("class", `place-node place-node-${type}`)
      .attr("transform", `translate(${datum.x},${datum.y})`)
      .on("mouseenter", function(event, d) {
        showPlacePie(d3.select(this), d, type);
        showTooltip(event, placeTooltip(d, type));
      })
      .on("mousemove", moveTooltip)
      .on("mouseleave", function(_, d) {
        restorePlaceNode(d3.select(this), d, type);
        hideTooltip();
      });

    group.append("circle")
      .attr("class", "place-node-circle")
      .attr("r", datum.r)
      .attr("fill", type === "country" ? "#4c4c4c" : "#7c7c7c");

    const labelY = type === "country" ? datum.r + 22 : datum.r + 18;
    group.append("text")
      .attr("class", "place-label")
      .attr("y", labelY)
      .text(datum.name);

    group.append("text")
      .attr("class", "place-sub-label")
      .attr("y", labelY + 14)
      .text(type === "country" ? `${datum.cities.length} cities` : `${datum.rows.length} photos`);
  }

  function showPlacePie(group, datum, type) {
    group.select(".place-node-circle").attr("fill", "transparent");
    group.selectAll(".pie-layer").remove();

    const summary = emotionSummary(datum.rows)
      .filter((item) => item.count > 0)
      .sort((a, b) => d3.descending(a.count, b.count));

    if (!summary.length) {
      group.select(".place-node-circle").attr("fill", type === "country" ? "#4c4c4c" : "#7c7c7c");
      return;
    }

    const pie = d3.pie().value((d) => d.count).sort(null)(summary);
    const arc = d3.arc().innerRadius(0).outerRadius(datum.r);
    group.append("g")
      .attr("class", "pie-layer")
      .selectAll("path")
      .data(pie)
      .join("path")
      .attr("class", "pie-slice")
      .attr("d", arc)
      .attr("fill", (d) => emotionColor(d.data.emotion));
  }

  function restorePlaceNode(group, datum, type) {
    group.selectAll(".pie-layer").remove();
    group.select(".place-node-circle").attr("fill", type === "country" ? "#4c4c4c" : "#7c7c7c");
  }

  function placeTooltip(datum, type) {
    const summary = emotionSummary(datum.rows).filter((d) => d.count > 0).sort((a, b) => b.count - a.count);
    const top = summary.slice(0, 3).map((d) => `${d.emotion} ${d.count}`).join(" · ");
    return `<strong>${datum.name}</strong>${datum.rows.length} photographs<br><span class="tooltip-muted">${type === "country" ? `${datum.cities.length} cities · ` : ""}${top || "No emotion annotations"}</span>`;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function imagePath(filename) {
    return `images/${encodeURIComponent(filename).replaceAll("%2F", "/")}`;
  }

  function humanizeKey(value) {
    return String(value).replaceAll("_", " ").replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function formatDate(date) {
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat("en", {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(date);
  }

  function formatScore(value) {
    if (value === null || !Number.isFinite(value)) return "—";
    return value > 0 ? `+${value}` : String(value);
  }

  function photoTooltip(row) {
    const src = imagePath(row.filename);
    return `
      <img class="tooltip-preview" src="${src}" alt="${escapeHtml(row.photo_id)} preview" onerror="this.style.display='none'">
      <div class="tooltip-copy">
        <strong>${escapeHtml(row.photo_id)}</strong>
        ${formatDate(row.datetime)} · ${escapeHtml(row.city)}<br>
        <span class="tooltip-muted">${escapeHtml(row.emotion)} ${formatScore(row.emotion_score)}</span>
      </div>
    `;
  }

  function showTooltip(event, html) {
    elements.tooltip.innerHTML = html;
    elements.tooltip.hidden = false;
    moveTooltip(event);
  }

  function moveTooltip(event) {
    if (elements.tooltip.hidden) return;
    const gap = 16;
    const rect = elements.tooltip.getBoundingClientRect();
    let x = event.clientX + gap;
    let y = event.clientY + gap;
    if (x + rect.width > window.innerWidth - 10) x = event.clientX - rect.width - gap;
    if (y + rect.height > window.innerHeight - 10) y = event.clientY - rect.height - gap;
    elements.tooltip.style.left = `${x}px`;
    elements.tooltip.style.top = `${y}px`;
  }

  function hideTooltip() {
    elements.tooltip.hidden = true;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ---------------------------------------------------------------------------
  // Horizontal page navigation
  // ---------------------------------------------------------------------------
  const horizontalTrack = document.querySelector("#horizontal-track");
  let horizontalX = 0;
  let horizontalTarget = 0;
  let horizontalMax = 0;
  let horizontalRaf = null;

  function measureHorizontal() {
    if (!horizontalTrack) return;
    horizontalMax = Math.max(0, horizontalTrack.scrollWidth - window.innerWidth);
    horizontalX = clamp(horizontalX, 0, horizontalMax);
    horizontalTarget = clamp(horizontalTarget, 0, horizontalMax);
    updateHorizontal();
  }

  function updateHorizontal() {
    if (!horizontalTrack) return;
    horizontalTrack.style.transform = `translate3d(${-horizontalX}px,0,0)`;
  }

  function animateHorizontal() {
    horizontalX += (horizontalTarget - horizontalX) * .11;
    if (Math.abs(horizontalTarget - horizontalX) < .2) horizontalX = horizontalTarget;
    updateHorizontal();

    if (horizontalX !== horizontalTarget) {
      horizontalRaf = requestAnimationFrame(animateHorizontal);
    } else {
      horizontalRaf = null;
    }
  }

  function requestHorizontal() {
    if (!horizontalRaf) horizontalRaf = requestAnimationFrame(animateHorizontal);
  }

  window.addEventListener("wheel", (event) => {
    if (!horizontalTrack) return;

    const target = event.target;
    if (target && (target.closest("select") || target.closest(".filter-panel") || target.closest(".comparison-legend"))) {
      return;
    }

    event.preventDefault();
    const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    horizontalTarget = clamp(horizontalTarget + delta * 1.08, 0, horizontalMax);
    requestHorizontal();
  }, { passive: false });

  window.addEventListener("move-horizontal-to", (event) => {
    const id = event.detail?.id;
    const panel = id ? document.getElementById(id) : null;
    if (!panel || !horizontalTrack) return;

    horizontalTarget = clamp(panel.offsetLeft, 0, horizontalMax);
    requestHorizontal();
  });

  window.addEventListener("resize", debounce(measureHorizontal, 120));
  document.addEventListener("DOMContentLoaded", () => { setTimeout(measureHorizontal, 0); setTimeout(() => { if (!state.comparisons || !state.comparisons.length) drawEmptyComparisonRadar(); }, 60); });

})();
