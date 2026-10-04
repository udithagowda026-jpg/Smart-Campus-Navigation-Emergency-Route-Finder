const locations = [
  { name: "Main Gate", x: 105, y: 430 },
  { name: "Block A", x: 300, y: 355 },
  { name: "Block B", x: 255, y: 160 },
  { name: "Library", x: 475, y: 275 },
  { name: "CSE Department", x: 475, y: 95 },
  { name: "AI Lab", x: 650, y: 205 },
  { name: "Computer Lab", x: 665, y: 80 },
  { name: "Canteen", x: 455, y: 485 },
  { name: "Auditorium", x: 655, y: 405 },
  { name: "Parking Area", x: 110, y: 565 },
  { name: "Hostel", x: 300, y: 560 },
  { name: "Medical Center", x: 755, y: 515 },
  { name: "Admin Block", x: 700, y: 300 },
  { name: "Sports Ground", x: 830, y: 430 }
];

const roads = [
  { from: "Main Gate", to: "Block A", minutes: 5, status: "NORMAL", emergency: true },
  { from: "Main Gate", to: "Block B", minutes: 7, status: "CROWDED", emergency: false },
  { from: "Block A", to: "Library", minutes: 3, status: "NORMAL", emergency: true },
  { from: "Library", to: "AI Lab", minutes: 2, status: "NORMAL", emergency: true },
  { from: "Block A", to: "Canteen", minutes: 4, status: "CROWDED", emergency: true },
  { from: "Block B", to: "CSE Department", minutes: 4, status: "NORMAL", emergency: true },
  { from: "CSE Department", to: "AI Lab", minutes: 3, status: "NORMAL", emergency: true },
  { from: "CSE Department", to: "Computer Lab", minutes: 2, status: "NORMAL", emergency: true },
  { from: "Library", to: "Admin Block", minutes: 6, status: "NORMAL", emergency: true },
  { from: "Admin Block", to: "Medical Center", minutes: 3, status: "NORMAL", emergency: true },
  { from: "Canteen", to: "Medical Center", minutes: 7, status: "NORMAL", emergency: true },
  { from: "Canteen", to: "Auditorium", minutes: 4, status: "NORMAL", emergency: true },
  { from: "Auditorium", to: "Sports Ground", minutes: 5, status: "NORMAL", emergency: true },
  { from: "Parking Area", to: "Main Gate", minutes: 3, status: "NORMAL", emergency: true },
  { from: "Parking Area", to: "Hostel", minutes: 6, status: "NORMAL", emergency: true },
  { from: "Hostel", to: "Medical Center", minutes: 4, status: "NORMAL", emergency: true },
  { from: "Block B", to: "Auditorium", minutes: 6, status: "EMERGENCY_ONLY", emergency: true },
  { from: "Sports Ground", to: "Hostel", minutes: 8, status: "NORMAL", emergency: true }
];

const elements = {
  start: document.querySelector("#route-start"),
  destination: document.querySelector("#route-destination"),
  routeOutput: document.querySelector("#route-output"),
  modeDescription: document.querySelector("#mode-description"),
  plannerNote: document.querySelector("#planner-note-text"),
  roadsLayer: document.querySelector("#roads-layer"),
  nodesLayer: document.querySelector("#nodes-layer"),
  roadTable: document.querySelector("#road-table-body"),
  historyList: document.querySelector("#history-list"),
  nearbyOutput: document.querySelector("#nearby-output"),
  search: document.querySelector("#location-search"),
  evacuationSettings: document.querySelector("#evacuation-settings"),
  crowdPressure: document.querySelector("#crowd-pressure"),
  crowdPressureValue: document.querySelector("#crowd-pressure-value"),
  incidentSeverity: document.querySelector("#incident-severity"),
  incidentSeverityValue: document.querySelector("#incident-severity-value"),
  evacueeCount: document.querySelector("#evacuee-count")
};

let routeMode = "normal";
let mapMode = "sample";
let latestRoute = null;
const routeHistory = [];

class MinHeap {
  constructor() { this.items = []; }

  push(item) {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent].distance <= item.distance) break;
      this.items[index] = this.items[parent];
      index = parent;
    }
    this.items[index] = item;
  }

  pop() {
    if (this.items.length === 0) return null;
    const first = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      let index = 0;
      while (index * 2 + 1 < this.items.length) {
        let child = index * 2 + 1;
        if (child + 1 < this.items.length &&
            this.items[child + 1].distance < this.items[child].distance) child++;
        if (last.distance <= this.items[child].distance) break;
        this.items[index] = this.items[child];
        index = child;
      }
      this.items[index] = last;
    }
    return first;
  }
}

function buildSelectors() {
  for (const location of locations) {
    for (const selector of [elements.start, elements.destination]) {
      const option = document.createElement("option");
      option.value = location.name;
      option.textContent = location.name;
      selector.append(option);
    }
  }
  elements.start.value = "Main Gate";
  elements.destination.value = "AI Lab";
}

function renderMetrics() {
  const safeCount = roads.filter(road => road.status !== "BLOCKED" && road.emergency).length;
  const blockedCount = roads.filter(road => road.status === "BLOCKED").length;
  document.querySelector("#metric-locations").textContent = locations.length;
  document.querySelector("#metric-roads").textContent = roads.length;
  document.querySelector("#metric-safe").textContent = safeCount;
  document.querySelector("#metric-blocked").textContent = String(blockedCount).padStart(2, "0");
  document.querySelector("#metric-safe-title").textContent = "Emergency available";
  document.querySelector("#metric-safe-code").textContent = "03 / SAFE";
  document.querySelector("#metric-blocked-title").textContent = "Blocked roads";
  document.querySelector("#metric-blocked-code").textContent = "04 / ALERT";
  document.querySelector(".metric-safe .metric-foot").lastChild.textContent = "Eligible road connections";
  document.querySelector(".metric-alert .metric-foot").textContent = "Excluded from all routes";
  document.querySelector("#header-location-count").textContent = `${locations.length} LOCATIONS`;
  document.querySelector("#road-count-label").textContent = `${roads.length} ROADS`;
}

function renderMap() {
  const positions = new Map(locations.map(location => [location.name, location]));
  elements.roadsLayer.replaceChildren();
  elements.nodesLayer.replaceChildren();

  roads.forEach((road, index) => {
    const from = positions.get(road.from);
    const to = positions.get(road.to);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    line.setAttribute("class", `road road-${road.status.toLowerCase()}`);
    line.dataset.roadIndex = index;
    line.dataset.from = road.from;
    line.dataset.to = road.to;
    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${road.from} to ${road.to}: ${road.minutes} minutes, ${road.status}`;
    line.append(title);
    elements.roadsLayer.append(line);
  });

  locations.forEach(location => {
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.setAttribute("class", "location-node");
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
    group.setAttribute("aria-label", `Set ${location.name} as route start`);
    group.dataset.name = location.name;

    const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    halo.setAttribute("class", "node-halo");
    halo.setAttribute("cx", location.x);
    halo.setAttribute("cy", location.y);
    halo.setAttribute("r", "9");

    const core = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    core.setAttribute("class", "node-core");
    core.setAttribute("cx", location.x);
    core.setAttribute("cy", location.y);
    core.setAttribute("r", "3");

    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("class", "location-label");
    label.setAttribute("x", location.x + 14);
    label.setAttribute("y", location.y + 4);
    label.textContent = location.name;

    group.append(halo, core, label);
    group.addEventListener("click", () => {
      elements.start.value = location.name;
      updateNodeStates();
    });
    group.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        elements.start.value = location.name;
        updateNodeStates();
      }
    });
    elements.nodesLayer.append(group);
  });
  updateNodeStates();
}

function renderRoadTable() {
  elements.roadTable.replaceChildren();
  const orderedRoads = roads.map((road, index) => ({ road, index }))
    .sort((left, right) => left.road.minutes - right.road.minutes);
  for (const { road, index } of orderedRoads) {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${road.from} <span aria-hidden="true">↔</span> ${road.to}</td>` +
      `<td>${road.minutes} min</td>` +
      `<td><span class="road-status ${road.status.toLowerCase()}">${road.status.replaceAll("_", " ")}</span></td>` +
      `<td><span class="emergency-tag ${road.emergency ? "" : "unavailable"}">${road.emergency ? "Available" : "No"}</span></td>`;
    row.dataset.roadIndex = index;
    elements.roadTable.append(row);
  }
}

function usableRoad(road, mode) {
  if (road.status === "BLOCKED") return false;
  if (mode === "emergency") return road.emergency;
  if (mode === "evacuation") return road.status !== "EMERGENCY_ONLY";
  return road.status !== "EMERGENCY_ONLY";
}

function getEvacuationScenario() {
  return {
    crowd: Number(elements.crowdPressure.value),
    severity: Number(elements.incidentSeverity.value),
    evacuees: Math.max(1, Math.min(5000, Number(elements.evacueeCount.value) || 1))
  };
}

function predictRoadRisk(road, scenario) {
  const capacity = road.status === "CROWDED" ? 24 : 48;
  const featureRisk = road.status === "CROWDED" ? 0.62 : 0.16;
  const risk = window.campusRiskModel.probability({
    ...scenario,
    capacity,
    featureRisk
  });
  return { risk, capacity, name: `${road.from} to ${road.to}` };
}

function shortestRoute(start, destination, mode) {
  const scenario = mode === "evacuation" ? getEvacuationScenario() : null;
  const distance = new Map(locations.map(location => [location.name, Infinity]));
  const parent = new Map();
  const visited = new Set();
  const heap = new MinHeap();
  distance.set(start, 0);
  heap.push({ name: start, distance: 0 });

  while (heap.items.length > 0) {
    const current = heap.pop();
    if (visited.has(current.name) || current.distance !== distance.get(current.name)) continue;
    visited.add(current.name);
    if (current.name === destination) break;

    for (const road of roads) {
      if (!usableRoad(road, mode)) continue;
      let next = null;
      if (road.from === current.name) next = road.to;
      else if (road.to === current.name) next = road.from;
      if (next === null) continue;
      let edgeCost = road.minutes;
      let prediction = null;
      if (mode === "evacuation") {
        prediction = predictRoadRisk(road, scenario);
        const adjustedMinutes = window.campusRiskModel.adjustedMinutes(
          road.minutes, scenario.crowd, prediction.risk);
        edgeCost = adjustedMinutes * (1 + prediction.risk * 1.6);
      }
      const candidate = current.distance + edgeCost;
      if (candidate < distance.get(next)) {
        distance.set(next, candidate);
        parent.set(next, { name: current.name, road, prediction });
        heap.push({ name: next, distance: candidate });
      }
    }
  }

  if (!Number.isFinite(distance.get(destination))) return null;
  const path = [destination];
  const legs = [];
  let current = destination;
  while (current !== start) {
    const previous = parent.get(current);
    if (!previous) return null;
    legs.unshift({
      from: previous.name,
      to: current,
      minutes: previous.road.minutes,
      ...(previous.prediction || {})
    });
    current = previous.name;
    path.unshift(current);
  }
  const totalMinutes = legs.reduce((total, leg) => total + leg.minutes, 0);
  const prediction = mode === "evacuation"
    ? window.campusRiskModel.summarize(legs, scenario.evacuees, scenario.crowd)
    : null;
  return {
    start,
    destination,
    path,
    legs,
    minutes: prediction ? prediction.walkingMinutes : totalMinutes,
    mode,
    ...(prediction || {})
  };
}

function renderRoute(route) {
  if (!route) {
    elements.routeOutput.innerHTML = `<div class="result-empty"><span class="result-index">ROUTE OUTPUT / NO PATH</span><p class="result-warning">No eligible route connects these locations in this mode.</p></div>`;
    return;
  }
  const routeType = route.mode === "emergency"
    ? "EMERGENCY"
    : route.mode === "accessible" ? "STEP-FREE" : route.mode === "evacuation" ? "EVACUATION" : "STANDARD";
  const legRows = route.legs.map(leg =>
    `<div class="result-leg"><span>${leg.from} → ${leg.to}</span><span>${leg.minutes} min${route.mode === "evacuation" ? ` · ${Math.round(leg.risk * 100)}% risk` : ""}</span></div>`
  ).join("");
  const evacuationSummary = route.mode === "evacuation"
    ? `<div class="evacuation-summary"><div><span>Predicted route risk</span><strong>${route.riskPercent}%</strong></div><div><span>Clearance estimate</span><strong>${route.clearanceMinutes} min</strong></div><p>Bottleneck: ${route.bottleneck} · approx. ${route.capacityPerMinute} people/min</p></div>`
    : "";
  elements.routeOutput.innerHTML = `<div class="result-heading"><div><span class="result-index">ROUTE OUTPUT / ${String(routeHistory.length).padStart(2, "0")}</span><strong>${route.minutes} <small>min</small></strong></div><span class="result-mode ${route.mode}">${routeType}</span></div>` +
    `<p class="result-path">${route.path.join(" <span aria-hidden=\"true\">→</span> ")}</p>` +
    `<div class="result-legs">${legRows}</div>${evacuationSummary}` +
    (route.mode === "evacuation"
      ? `<p class="result-warning">Scenario heuristic, not trained AI. No live crowd, incident, or closure feed.</p>`
      : "");
}

function updateNodeStates() {
  const start = elements.start.value;
  const destination = elements.destination.value;
  const query = elements.search.value.trim().toLowerCase();
  const routeLocations = new Set(latestRoute ? latestRoute.path : []);
  for (const node of elements.nodesLayer.querySelectorAll(".location-node")) {
    const name = node.dataset.name;
    node.classList.toggle("is-start", name === start);
    node.classList.toggle("is-end", name === destination);
    node.classList.toggle("is-on-route", routeMode === "normal" && routeLocations.has(name));
    node.classList.toggle("is-on-accessible-route", routeMode === "accessible" && routeLocations.has(name));
    node.classList.toggle("is-on-evacuation-route", routeMode === "evacuation" && routeLocations.has(name));
    node.classList.toggle("is-on-emergency-route", routeMode === "emergency" && routeLocations.has(name));
    node.classList.toggle("is-muted", query !== "" && !name.toLowerCase().includes(query));
  }
}

function updateRoadHighlights(route) {
  const edges = new Set();
  if (route) {
    for (const leg of route.legs) {
      const index = roads.findIndex(road =>
        (road.from === leg.from && road.to === leg.to) ||
        (road.from === leg.to && road.to === leg.from));
      if (index >= 0) edges.add(index);
    }
  }
  for (const line of elements.roadsLayer.querySelectorAll(".road")) {
    const selected = edges.has(Number(line.dataset.roadIndex));
    line.classList.toggle("is-route", selected && routeMode === "normal");
    line.classList.toggle("is-accessible-route", selected && routeMode === "accessible");
    line.classList.toggle("is-evacuation-route", selected && routeMode === "evacuation");
    line.classList.toggle("is-emergency-route", selected && routeMode === "emergency");
  }
  updateNodeStates();
}

function updateHistory(route) {
  routeHistory.unshift({ ...route, time: new Date() });
  document.querySelector("#activity-count").textContent = String(routeHistory.length).padStart(2, "0");
  elements.historyList.replaceChildren();
  routeHistory.slice(0, 5).forEach(item => {
    const entry = document.createElement("article");
    entry.className = `history-item ${item.mode}`;
    const title = document.createElement("div");
    title.className = "history-title";
    title.innerHTML = `<span>${item.start} <span aria-hidden="true">→</span> ${item.destination}</span><span>${item.minutes} min</span>`;
    const meta = document.createElement("div");
    meta.className = "history-meta";
    const modeLabel = item.mode === "emergency" ? "Emergency route" : item.mode === "accessible" ? "Step-free route" : item.mode === "evacuation" ? "Evacuation prediction" : "Standard route";
    meta.textContent = `${modeLabel} · ${item.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    entry.append(title, meta);
    elements.historyList.append(entry);
  });
}

function findRoute(event) {
  event.preventDefault();
  const start = elements.start.value;
  const destination = elements.destination.value;
  if (start === destination) {
    elements.routeOutput.innerHTML = `<div class="result-empty"><span class="result-index">ROUTE OUTPUT / CHECK INPUT</span><p class="result-warning">Choose two different locations.</p></div>`;
    return;
  }
  const route = shortestRoute(start, destination, routeMode);
  latestRoute = route;
  renderRoute(route);
  updateRoadHighlights(route);
  if (route) updateHistory(route);
}

function displayReachable() {
  const start = elements.start.value;
  const visited = new Set([start]);
  const queue = [start];
  const reachable = [];
  for (let front = 0; front < queue.length; front++) {
    const current = queue[front];
    for (const road of roads) {
      if (road.status === "BLOCKED" || road.status === "EMERGENCY_ONLY") continue;
      const next = road.from === current ? road.to : road.to === current ? road.from : null;
      if (next !== null && !visited.has(next)) {
        visited.add(next);
        queue.push(next);
        reachable.push(next);
      }
    }
  }
  elements.nearbyOutput.hidden = false;
  elements.nearbyOutput.textContent = reachable.length
    ? `${reachable.length} locations reachable from ${start}: ${reachable.join(", ")}`
    : `No other ordinary-road locations reachable from ${start}.`;
}

function setMode(mode) {
  routeMode = mode;
  elements.evacuationSettings.hidden = mode !== "evacuation";
  for (const button of document.querySelectorAll(".mode-button")) {
    const selected = button.dataset.mode === mode;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  elements.modeDescription.textContent = mode === "emergency"
    ? "Blocked and emergency-unavailable roads are excluded."
    : mode === "accessible"
      ? "Avoids mapped stairways where accessibility tags are available."
      : mode === "evacuation"
        ? "Risk-adjusted route for a simulated crowd and incident scenario."
        : "Shortest travel time on ordinary open roads.";
  elements.plannerNote.textContent = mode === "emergency"
    ? "Emergency-only roads are included when marked available."
    : mode === "accessible"
      ? "Confirm step-free access on site; map tags may be incomplete."
      : mode === "evacuation"
        ? "Prediction is heuristic only; no live sensors or incident feed."
        : "Crowded roads remain available for standard routing.";
  updateRoadHighlights(latestRoute);
  window.liveCampusMap?.setMode(mode);
  window.liveCampusMap?.setScenario(getEvacuationScenario());
}

function setMapMode(mode) {
  mapMode = mode;
  const live = mode === "live";
  const panel = document.querySelector(".map-panel");
  document.querySelector("#sample-map").hidden = live;
  document.querySelector("#live-map").hidden = !live;
  document.querySelector("#live-location-tools").hidden = !live;
  document.querySelector("#sample-route-controls").hidden = live;
  document.querySelector("#live-route-controls").hidden = !live;
  panel.classList.toggle("live-mode", live);
  document.querySelector("#sample-map-tab").classList.toggle("is-selected", !live);
  document.querySelector("#live-map-tab").classList.toggle("is-selected", live);
  document.querySelector("#sample-map-tab").setAttribute("aria-pressed", String(!live));
  document.querySelector("#live-map-tab").setAttribute("aria-pressed", String(live));
  if (live) {
    elements.plannerNote.textContent = routeMode === "evacuation"
      ? "Scenario prediction only; mapped closures and live sensor data are unavailable."
      : "Mapped paths are estimates; closures and emergency access are not live.";
    window.liveCampusMap?.enable();
  } else {
    renderMetrics();
    renderRoadTable();
    window.liveCampusMap?.disable();
    elements.plannerNote.textContent = routeMode === "emergency"
      ? "Emergency-only roads are included when marked available."
      : routeMode === "accessible"
        ? "Confirm step-free access on site; map tags may be incomplete."
        : routeMode === "evacuation"
          ? "Prediction is heuristic only; no live sensors or incident feed."
          : "Crowded roads remain available for standard routing.";
  }
}

function updateScenarioControls() {
  const crowd = Number(elements.crowdPressure.value);
  const severity = Number(elements.incidentSeverity.value);
  const evacuees = Math.max(1, Math.min(5000, Number(elements.evacueeCount.value) || 1));
  elements.crowdPressureValue.value = `${crowd}%`;
  elements.crowdPressureValue.textContent = `${crowd}%`;
  elements.incidentSeverityValue.value = `${severity}%`;
  elements.incidentSeverityValue.textContent = `${severity}%`;
  elements.evacueeCount.value = evacuees;
  window.liveCampusMap?.setScenario({ crowd, severity, evacuees });
}

function init() {
  buildSelectors();
  renderMetrics();
  renderMap();
  renderRoadTable();
  document.querySelector("#route-form").addEventListener("submit", event => {
    if (mapMode === "live") {
      window.liveCampusMap?.findRoute(event);
    } else {
      findRoute(event);
    }
  });
  document.querySelector("#sample-map-tab").addEventListener("click", () => setMapMode("sample"));
  document.querySelector("#live-map-tab").addEventListener("click", () => setMapMode("live"));
  document.querySelectorAll(".mode-button").forEach(button => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });
  elements.crowdPressure.addEventListener("input", updateScenarioControls);
  elements.incidentSeverity.addEventListener("input", updateScenarioControls);
  elements.evacueeCount.addEventListener("change", updateScenarioControls);
  updateScenarioControls();
  document.querySelector("#nearby-button").addEventListener("click", () => {
    if (mapMode === "live") {
      window.liveCampusMap?.displayReachable();
    } else {
      displayReachable();
    }
  });
  elements.start.addEventListener("change", updateNodeStates);
  elements.destination.addEventListener("change", updateNodeStates);
  elements.search.addEventListener("input", updateNodeStates);
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      elements.search.focus();
    }
  });
}

init();