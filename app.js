/* European Captives Leaflet prototype — no build step required. */
(() => {
  "use strict";

  const COLORS = { origin: "#176f9c", captivity: "#bd5a2b", connection: "#6f558d" };
  const MAX_LISTED_RECORDS = 250;
  const state = {
    data: null,
    map: null,
    layers: {},
    recordById: new Map(),
    selectedLocation: null,
    selectedConnection: null,
    lastFocus: null,
  };

  const el = (id) => document.getElementById(id);
  const controls = {
    search: el("record-search"),
    minYear: el("min-year"),
    maxYear: el("max-year"),
    minOutput: el("min-year-output"),
    maxOutput: el("max-year-output"),
    origins: el("show-origins"),
    captivity: el("show-captivity"),
    connections: el("show-connections"),
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
    }[char]));
  }

  function compactNumber(value) {
    return new Intl.NumberFormat("en", { notation: value >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(value);
  }

  function debounce(fn, wait = 120) {
    let timer;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  function initMap() {
    state.map = L.map("map", { preferCanvas: true, zoomControl: true }).setView([40.1, -5.5], 4);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(state.map);
    state.layers.connection = L.layerGroup().addTo(state.map);
    state.layers.marker = L.layerGroup().addTo(state.map);
    state.layers.highlight = L.layerGroup().addTo(state.map);
  }

  function prepareSearchText(record) {
    return [
      record.display_name, record.captive_name_original, record.date_original, record.year,
      record.source, record.place_of_captivity_original, record.captivity_standardized,
      record.notes, record.total, record.gender, record.place_of_origin_original,
      record.origin_standardized, record.convert, record.ship_name, record.record_id,
    ].join(" ").toLocaleLowerCase();
  }

  function normalizedYearBounds() {
    let min = Number(controls.minYear.value);
    let max = Number(controls.maxYear.value);
    if (min > max) [min, max] = [max, min];
    controls.minOutput.value = String(min);
    controls.maxOutput.value = String(max);
    return { min, max };
  }

  function baseFilteredRecords() {
    const { min, max } = normalizedYearBounds();
    const query = controls.search.value.trim().toLocaleLowerCase();
    const fullRange = min === state.data.metadata.minimum_year && max === state.data.metadata.maximum_year;
    return state.data.records.filter((record) => {
      const yearMatch = record.year === null ? fullRange : (record.year >= min && record.year <= max);
      const queryMatch = !query || record._search.includes(query);
      return yearMatch && queryMatch;
    });
  }

  function panelFilteredRecords(baseRecords) {
    if (state.selectedLocation) {
      const { mappingId, role } = state.selectedLocation;
      const key = role === "origin" ? "origin_mapping_id" : "captivity_mapping_id";
      return baseRecords.filter((record) => record[key] === mappingId);
    }
    if (state.selectedConnection) {
      const { originId, captivityId } = state.selectedConnection;
      return baseRecords.filter((record) => record.origin_mapping_id === originId && record.captivity_mapping_id === captivityId);
    }
    return baseRecords;
  }

  function buildLocationCounts(records) {
    const counts = new Map();
    for (const record of records) {
      if (record.origin_mapping_id) {
        const key = `origin|${record.origin_mapping_id}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
      if (record.captivity_mapping_id) {
        const key = `captivity|${record.captivity_mapping_id}`;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
    return counts;
  }

  function buildConnectionCounts(records) {
    const counts = new Map();
    for (const record of records) {
      if (!record.origin_mapping_id || !record.captivity_mapping_id) continue;
      const key = `${record.origin_mapping_id}|${record.captivity_mapping_id}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }

  function markerRadius(count) {
    return Math.min(25, 5 + Math.sqrt(count) * 1.05);
  }

  function popupForLocation(location, role, count) {
    const roleLabel = role === "origin" ? "Origin" : "Captivity location";
    const certainty = location.certainty === "high" ? "Reviewed" : `${location.certainty} certainty`;
    return `
      <h3>${escapeHtml(location.standardized_name)}</h3>
      <div class="popup-meta"><strong>${roleLabel}</strong> · ${count.toLocaleString()} filtered record${count === 1 ? "" : "s"}</div>
      <div class="popup-meta">Source label: ${escapeHtml(location.original_label)} · ${escapeHtml(certainty)}</div>
      <div class="popup-note">${escapeHtml(location.review_note)}</div>`;
  }

  function renderMap(records) {
    state.layers.marker.clearLayers();
    state.layers.connection.clearLayers();
    const locationCounts = buildLocationCounts(records);

    if (controls.connections.checked) {
      const connectionCounts = buildConnectionCounts(records);
      for (const [key, count] of connectionCounts) {
        const [originId, captivityId] = key.split("|");
        const origin = state.data.locations[originId];
        const captivity = state.data.locations[captivityId];
        if (!origin || !captivity) continue;
        const line = L.polyline(
          [[origin.latitude, origin.longitude], [captivity.latitude, captivity.longitude]],
          { color: COLORS.connection, weight: Math.min(8, 1.2 + Math.log2(count + 1)), opacity: .42, interactive: true }
        ).addTo(state.layers.connection);
        line.bindTooltip(`${origin.standardized_name} → ${captivity.standardized_name}: ${count} record${count === 1 ? "" : "s"}<br>Documented association, not a reconstructed route.`);
        line.on("click", () => {
          state.selectedLocation = null;
          state.selectedConnection = { originId, captivityId };
          updateSelectionChip(`${origin.standardized_name} → ${captivity.standardized_name}`);
          renderRecordList(panelFilteredRecords(baseFilteredRecords()));
        });
      }
    }

    for (const [key, count] of locationCounts) {
      const [role, mappingId] = key.split("|");
      if (role === "origin" && !controls.origins.checked) continue;
      if (role === "captivity" && !controls.captivity.checked) continue;
      const location = state.data.locations[mappingId];
      if (!location) continue;
      const marker = L.circleMarker([location.latitude, location.longitude], {
        radius: markerRadius(count),
        color: "#fffdf8",
        weight: 1.5,
        fillColor: COLORS[role],
        fillOpacity: .83,
        dashArray: location.certainty === "high" ? null : "3 2",
      }).addTo(state.layers.marker);
      marker.bindPopup(popupForLocation(location, role, count));
      marker.bindTooltip(`${location.standardized_name}: ${count.toLocaleString()} ${role} record${count === 1 ? "" : "s"}`, { sticky: true });
      marker.on("click", () => {
        state.selectedConnection = null;
        state.selectedLocation = { mappingId, role };
        updateSelectionChip(`${role === "origin" ? "Origin" : "Captivity"}: ${location.standardized_name}`);
        renderRecordList(panelFilteredRecords(baseFilteredRecords()));
      });
    }
  }

  function geographySummary(record) {
    const origin = record.origin_standardized || (record.place_of_origin_original && record.place_of_origin_original !== "n/a" ? `${record.place_of_origin_original} (unresolved)` : "Origin unknown");
    const captivity = record.captivity_standardized || (record.place_of_captivity_original && record.place_of_captivity_original !== "n/a" ? `${record.place_of_captivity_original} (unresolved)` : "Captivity location unknown");
    return `${origin} → ${captivity}`;
  }

  function renderRecordList(records) {
    const container = el("record-list");
    container.replaceChildren();
    el("record-count").textContent = `${records.length.toLocaleString()} matching`;
    const limited = records.slice(0, MAX_LISTED_RECORDS);
    el("record-limit-note").textContent = records.length > MAX_LISTED_RECORDS
      ? `Showing the first ${MAX_LISTED_RECORDS.toLocaleString()} records. Refine the search, year range, or map selection to narrow the list.`
      : "Select a record to inspect all source fields and mapping notes.";

    if (!records.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No records match the current filters.";
      container.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const record of limited) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `record-card ${record.geography_status}`;
      const title = document.createElement("strong");
      title.textContent = record.display_name;
      const date = document.createElement("span");
      date.textContent = `${record.date_original || "Date unknown"}${record.year ? ` · normalized year ${record.year}` : ""}`;
      const geo = document.createElement("span");
      geo.textContent = geographySummary(record);
      button.append(title, date, geo);
      button.addEventListener("click", () => openRecord(record, button));
      fragment.append(button);
    }
    container.append(fragment);
  }

  function updateStats(records) {
    const locationIds = new Set();
    let connected = 0;
    let unmapped = 0;
    for (const record of records) {
      if (record.origin_mapping_id) locationIds.add(record.origin_mapping_id);
      if (record.captivity_mapping_id) locationIds.add(record.captivity_mapping_id);
      if (record.origin_mapping_id && record.captivity_mapping_id) connected += 1;
      if (!record.origin_mapping_id && !record.captivity_mapping_id) unmapped += 1;
    }
    el("stat-records").textContent = compactNumber(records.length);
    el("stat-locations").textContent = locationIds.size.toLocaleString();
    el("stat-connections").textContent = compactNumber(connected);
    el("stat-unmapped").textContent = compactNumber(unmapped);
  }

  function updateSelectionChip(label) {
    const chip = el("selection-chip");
    chip.hidden = false;
    el("selection-label").textContent = label;
  }

  function clearSelection() {
    state.selectedLocation = null;
    state.selectedConnection = null;
    el("selection-chip").hidden = true;
    renderRecordList(baseFilteredRecords());
  }

  function render() {
    const records = baseFilteredRecords();
    renderMap(records);
    updateStats(records);
    renderRecordList(panelFilteredRecords(records));
  }

  function detailRow(label, value) {
    if (value === null || value === undefined || value === "" || value === "n/a") return null;
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = label;
    const td = document.createElement("td");
    td.textContent = Array.isArray(value) ? value.join("; ") : String(value);
    tr.append(th, td);
    return tr;
  }

  function openRecord(record, trigger) {
    state.lastFocus = trigger || document.activeElement;
    state.layers.highlight.clearLayers();
    const points = [];
    const origin = state.data.locations[record.origin_mapping_id];
    const captivity = state.data.locations[record.captivity_mapping_id];
    if (origin) {
      points.push([origin.latitude, origin.longitude]);
      L.circleMarker(points[points.length - 1], { radius: 10, color: "#fff", weight: 3, fillColor: COLORS.origin, fillOpacity: 1 }).addTo(state.layers.highlight);
    }
    if (captivity) {
      points.push([captivity.latitude, captivity.longitude]);
      L.circleMarker(points[points.length - 1], { radius: 10, color: "#fff", weight: 3, fillColor: COLORS.captivity, fillOpacity: 1 }).addTo(state.layers.highlight);
    }
    if (origin && captivity) {
      L.polyline(points, { color: COLORS.connection, weight: 5, opacity: .9, dashArray: "8 6" }).addTo(state.layers.highlight);
    }
    if (points.length === 1) state.map.setView(points[0], Math.max(state.map.getZoom(), 6));
    if (points.length > 1) state.map.fitBounds(points, { padding: [50, 50], maxZoom: 7 });

    el("detail-title").textContent = record.display_name;
    const content = el("detail-content");
    content.replaceChildren();
    if (record.data_quality_flags.length || record.origin_certainty === "low" || record.origin_certainty === "medium") {
      const caution = document.createElement("div");
      caution.className = "caution-box";
      caution.textContent = "This record contains a date or place interpretation that requires scholarly review. Original values and review notes are retained below.";
      content.append(caution);
    }
    const table = document.createElement("table");
    table.className = "detail-table";
    const fields = [
      ["Record ID", record.record_id],
      ["Captive's name", record.captive_name_original],
      ["Date as recorded", record.date_original],
      ["Normalized year", record.year],
      ["Date precision", record.date_precision],
      ["Date note", record.date_normalization_note],
      ["Source", record.source],
      ["Place of captivity", record.place_of_captivity_original],
      ["Mapped captivity place", record.captivity_standardized],
      ["Captivity mapping certainty", record.captivity_certainty !== "unresolved" ? record.captivity_certainty : ""],
      ["Captivity mapping note", record.captivity_review_note],
      ["Notes", record.notes],
      ["Total", record.total],
      ["Gender", record.gender],
      ["Place of origin", record.place_of_origin_original],
      ["Mapped origin", record.origin_standardized],
      ["Origin mapping certainty", record.origin_certainty !== "unresolved" ? record.origin_certainty : ""],
      ["Origin mapping note", record.origin_review_note],
      ["Convert", record.convert],
      ["Ship name", record.ship_name],
      ["Geographic evidence", record.geography_status.replaceAll("_", " ")],
      ["Data-quality flags", record.data_quality_flags],
      ["Original CSV row", record.source_row],
    ];
    for (const [label, value] of fields) {
      const row = detailRow(label, value);
      if (row) table.append(row);
    }
    content.append(table);
    const panel = el("detail-panel");
    panel.classList.add("open");
    panel.setAttribute("aria-hidden", "false");
    el("close-detail").focus();
  }

  function closeDetail() {
    const panel = el("detail-panel");
    panel.classList.remove("open");
    panel.setAttribute("aria-hidden", "true");
    state.layers.highlight.clearLayers();
    if (state.lastFocus && typeof state.lastFocus.focus === "function") state.lastFocus.focus();
  }

  function bindControls() {
    const rerender = debounce(render, 90);
    controls.search.addEventListener("input", rerender);
    controls.minYear.addEventListener("input", rerender);
    controls.maxYear.addEventListener("input", rerender);
    controls.origins.addEventListener("change", render);
    controls.captivity.addEventListener("change", render);
    controls.connections.addEventListener("change", render);
    el("clear-selection").addEventListener("click", clearSelection);
    el("reset-filters").addEventListener("click", () => {
      const meta = state.data.metadata;
      controls.search.value = "";
      controls.minYear.value = meta.minimum_year;
      controls.maxYear.value = meta.maximum_year;
      controls.origins.checked = true;
      controls.captivity.checked = true;
      controls.connections.checked = true;
      clearSelection();
      render();
    });
    el("close-detail").addEventListener("click", closeDetail);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && el("detail-panel").classList.contains("open")) closeDetail();
    });
  }

  async function init() {
    if (typeof L === "undefined") {
      el("loading").hidden = true;
      const box = el("map-error");
      box.hidden = false;
      box.textContent = "Leaflet could not be loaded. Check the internet connection or make a local copy of the Leaflet 1.9.4 assets before deploying in an offline environment.";
      return;
    }
    initMap();
    try {
      const response = await fetch("data/app-data.json");
      if (!response.ok) throw new Error(`Data request failed (${response.status})`);
      state.data = await response.json();
      for (const record of state.data.records) {
        record._search = prepareSearchText(record);
        state.recordById.set(record.record_id, record);
      }
      const meta = state.data.metadata;
      for (const range of [controls.minYear, controls.maxYear]) {
        range.min = meta.minimum_year;
        range.max = meta.maximum_year;
        range.step = 1;
      }
      controls.minYear.value = meta.minimum_year;
      controls.maxYear.value = meta.maximum_year;
      bindControls();
      render();
      el("loading").hidden = true;
    } catch (error) {
      el("loading").hidden = true;
      const box = el("map-error");
      box.hidden = false;
      box.textContent = "The prototype data could not be loaded. Serve this folder over HTTP (for example, python3 -m http.server 8000) rather than opening index.html directly. " + error.message;
      console.error(error);
    }
  }

  init();
})();
