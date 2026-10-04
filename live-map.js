(() => {
  const ui = {
    map: document.querySelector("#live-map"),
    state: document.querySelector("#real-map-state"),
    search: document.querySelector("#campus-search"),
    searchForm: document.querySelector("#place-search-form"),
    locationButton: document.querySelector("#use-my-location"),
    radius: document.querySelector("#map-radius"),
    startButton: document.querySelector("#pick-start"),
    destinationButton: document.querySelector("#pick-destination"),
    startLabel: document.querySelector("#live-start-label"),
    destinationLabel: document.querySelector("#live-destination-label"),
    instruction: document.querySelector("#pick-instruction"),
    routeOutput: document.querySelector("#route-output"),
    routeHistory: document.querySelector("#history-list"),
    activityCount: document.querySelector("#activity-count"),
    nearbyOutput: document.querySelector("#nearby-output"),
    roadTable: document.querySelector("#road-table-body")
  };

  const state = {
    map: null,
    baseLayer: null,
    routeLayer: null,
    center: null,
    nodes: new Map(),
    adjacency: new Map(),
    segments: [],
    ways: [],
    markers: {},
    endpoints: { start: null, destination: null },
    nextPick: null,
    mode: "normal",
    scenario: { crowd: 35, severity: 25, evacuees: 300 },
    history: [],
    requestId: 0
  };

  const WALKING_METERS_PER_MINUTE = 80;
  const MAX_SNAP_METERS = 220;

  function showState(message, kind = "") {
    ui.state.textContent = message;
    ui.state.className = `real-map-state ${kind}`.trim();
    ui.state.hidden = false;
  }

  function hideState() {
    ui.state.hidden = true;
  }

  function enable() {
    if (typeof window.L === "undefined") {
      showState("The map library did not load. Check your internet connection and refresh.", "is-error");
      return;
    }
    if (!state.map) {
      state.map = window.L.map(ui.map, { scrollWheelZoom: true }).setView([0, 0], 2);
      window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>'
      }).addTo(state.map);
      state.baseLayer = window.L.layerGroup().addTo(state.map);
      state.routeLayer = window.L.layerGroup().addTo(state.map);
      state.map.on("click", chooseMapPoint);
      showState("Search for a campus or use your location to load mapped walking paths.");
    } else {
      window.setTimeout(() => state.map.invalidateSize(), 80);
      if (state.nodes.size > 0) {
        showState(`${state.nodes.size.toLocaleString()} mapped path points loaded. Choose start and destination on the map.`);
      }
    }
  }

  function disable() {
    if (state.map) {
      window.setTimeout(() => state.map.invalidateSize(), 80);
    }
  }

  function setMode(mode) {
    state.mode = mode;
    if (state.nodes.size > 0) {
      const stepsCount = state.segments.filter(segment => segment.highway === "steps").length;
      showState(mode === "emergency"
        ? `Emergency estimate: stairs excluded (${stepsCount} mapped stair segments). No live closure or dispatch data.`
        : mode === "accessible"
          ? `Step-free estimate: ${stepsCount} mapped stair segments excluded. OSM accessibility tags may be incomplete.`
          : mode === "evacuation"
            ? "Evacuation profile uses a scenario-only risk heuristic; it is not a trained AI model."
          : "Standard route estimate uses mapped pedestrian ways; field conditions may differ.");
    }
  }

  function setScenario(scenario) {
    state.scenario = {
      crowd: Math.max(0, Math.min(100, Number(scenario.crowd) || 0)),
      severity: Math.max(0, Math.min(100, Number(scenario.severity) || 0)),
      evacuees: Math.max(1, Math.min(5000, Number(scenario.evacuees) || 1))
    };
  }

  function haversineMeters(left, right) {
    const toRadians = value => value * Math.PI / 180;
    const latitudeDelta = toRadians(right.lat - left.lat);
    const longitudeDelta = toRadians(right.lon - left.lon);
    const firstLatitude = toRadians(left.lat);
    const secondLatitude = toRadians(right.lat);
    const value = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function addSegment(from, to, meters, way) {
    if (from === to || meters < 0.5) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (state.segmentKeys.has(key)) return;
    state.segmentKeys.add(key);
    const segment = {
      from,
      to,
      meters,
      minutes: meters / WALKING_METERS_PER_MINUTE,
      highway: way.tags.highway || "path",
      wayId: way.id,
      name: way.tags.name || "Mapped path"
    };
    state.segments.push(segment);
    if (!state.adjacency.has(from)) state.adjacency.set(from, []);
    if (!state.adjacency.has(to)) state.adjacency.set(to, []);
    state.adjacency.get(from).push({ node: to, segment });
    state.adjacency.get(to).push({ node: from, segment });
  }

  function isPublicFootway(way) {
    const tags = way.tags || {};
    const highway = tags.highway;
    const allowed = new Set([
      "footway", "path", "pedestrian", "steps", "living_street", "residential",
      "service", "tertiary", "secondary", "unclassified", "track", "primary"
    ]);
    return allowed.has(highway) &&
      !["no", "private", "customers", "delivery", "destination"].includes(tags.access) &&
      !["no", "private", "customers", "delivery", "destination"].includes(tags.foot);
  }

  function addMetric(id, value) {
    document.querySelector(id).textContent = value;
  }

  function renderLiveMetrics() {
    const emergencySegments = state.segments.filter(segment => segment.highway !== "steps").length;
    addMetric("#metric-locations", state.nodes.size.toLocaleString());
    addMetric("#metric-roads", state.segments.length.toLocaleString());
    addMetric("#metric-safe", emergencySegments.toLocaleString());
    addMetric("#metric-blocked", "--");
    document.querySelector("#metric-safe-title").textContent = "Mapped non-step paths";
    document.querySelector("#metric-safe-code").textContent = "03 / MAP";
    document.querySelector("#metric-blocked-title").textContent = "Live closures";
    document.querySelector("#metric-blocked-code").textContent = "04 / DATA";
    document.querySelector(".metric-safe .metric-foot").lastChild.textContent = "Not verified for emergency access";
    document.querySelector(".metric-alert .metric-foot").textContent = "No live incident feed connected";
    document.querySelector("#header-location-count").textContent = `${state.nodes.size.toLocaleString()} PATH POINTS`;
    document.querySelector("#road-count-label").textContent = `${state.segments.length.toLocaleString()} SEGMENTS`;
  }

  function renderLiveRoadTable() {
    ui.roadTable.replaceChildren();
    const shownWays = state.ways.slice(0, 30);
    for (const way of shownWays) {
      const row = document.createElement("tr");
      const name = document.createElement("td");
      name.textContent = way.tags.name || `${way.tags.highway || "Path"} (OSM ${way.id})`;
      const time = document.createElement("td");
      time.textContent = `${Math.max(1, Math.round(way.meters / WALKING_METERS_PER_MINUTE))} min`;
      const statusCell = document.createElement("td");
      const status = document.createElement("span");
      status.className = `road-status ${way.tags.highway === "steps" ? "emergency_only" : "normal"}`;
      status.textContent = way.tags.highway === "steps" ? "STEPS" : "MAPPED";
      statusCell.append(status);
      const emergency = document.createElement("td");
      emergency.className = way.tags.highway === "steps" ? "emergency-tag unavailable" : "emergency-tag";
      emergency.textContent = way.tags.highway === "steps" ? "Excluded" : "Mapped";
      row.append(name, time, statusCell, emergency);
      ui.roadTable.append(row);
    }
  }

  function buildNetwork(elements, center) {
    state.nodes.clear();
    state.adjacency.clear();
    state.segments = [];
    state.ways = [];
    state.segmentKeys = new Set();
    state.endpoints = { start: null, destination: null };
    state.baseLayer.clearLayers();
    state.routeLayer.clearLayers();
    for (const marker of Object.values(state.markers)) state.map.removeLayer(marker);
    state.markers = {};

    for (const way of elements) {
      if (way.type !== "way" || !isPublicFootway(way) || !Array.isArray(way.geometry) || way.geometry.length < 2) continue;
      const wayNodes = [];
      let wayMeters = 0;
      for (const point of way.geometry) {
        const id = `${Number(point.lat).toFixed(6)},${Number(point.lon).toFixed(6)}`;
        if (!state.nodes.has(id)) {
          state.nodes.set(id, { id, lat: Number(point.lat), lon: Number(point.lon) });
        }
        wayNodes.push(state.nodes.get(id));
      }
      for (let index = 0; index + 1 < wayNodes.length; index++) {
        const meters = haversineMeters(wayNodes[index], wayNodes[index + 1]);
        wayMeters += meters;
        addSegment(wayNodes[index].id, wayNodes[index + 1].id, meters, way);
      }
      way.meters = wayMeters;
      state.ways.push(way);
      const polyline = window.L.polyline(
        wayNodes.map(node => [node.lat, node.lon]),
        { color: way.tags.highway === "steps" ? "#bf8c31" : "#708d79", weight: 3, opacity: 0.65 }
      );
      const tooltip = document.createElement("span");
      tooltip.textContent = `${way.tags.name || way.tags.highway} · ${Math.round(wayMeters)} m`;
      polyline.bindTooltip(tooltip);
      polyline.addTo(state.baseLayer);
    }
    state.segmentKeys.clear();
    renderLiveMetrics();
    renderLiveRoadTable();
    ui.startLabel.textContent = "Choose a point on the map";
    ui.destinationLabel.textContent = "Choose a point on the map";
    ui.instruction.textContent = "Select a start or destination button, then click a nearby path.";
    ui.nearbyOutput.hidden = true;

    if (state.nodes.size === 0) {
      showState("No public walking paths found here. Try a larger search radius or another place.", "is-error");
      return;
    }
    document.querySelector(".metric-safe .metric-foot").lastChild.textContent = "Mapped paths without stairs";
    state.center = center;
    state.map.setView([center.lat, center.lon], 17);
    showState(`${state.nodes.size.toLocaleString()} path points and ${state.segments.length.toLocaleString()} mapped segments loaded. Select points on the map.`);
  }

  async function loadPaths(center) {
    const requestId = ++state.requestId;
    const radius = Number(ui.radius.value);
    showState(`Loading OpenStreetMap walking paths within ${radius} m…`, "is-loading");
    ui.instruction.textContent = "Loading mapped paths…";
    const query = `[out:json][timeout:25];way(around:${radius},${center.lat},${center.lon})["highway"~"^(footway|path|pedestrian|steps|living_street|residential|service|tertiary|secondary|unclassified|track|primary)$"]["access"!~"^(private|no|customers|delivery|destination)$"]["foot"!~"^(private|no|customers|delivery|destination)$"];out geom;`;
    try {
      const response = await fetch("https://overpass-api.de/api/interpreter", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(35000)
      });
      if (!response.ok) throw new Error(`OpenStreetMap query failed (${response.status}).`);
      const data = await response.json();
      if (requestId !== state.requestId) return;
      buildNetwork(data.elements || [], center);
    } catch (error) {
      if (requestId !== state.requestId) return;
      const message = error.name === "TimeoutError"
        ? "The map data request timed out. Try again or reduce the search radius."
        : `${error.message} Check internet access or try again in a moment.`;
      showState(message, "is-error");
      ui.instruction.textContent = "Path data could not be loaded.";
    }
  }

  async function searchPlace(event) {
    event.preventDefault();
    const query = ui.search.value.trim();
    if (!query) {
      showState("Enter a campus name, address, or place to search.", "is-error");
      ui.search.focus();
      return;
    }
    showState("Finding place…", "is-loading");
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.search = new URLSearchParams({ format: "jsonv2", limit: "1", q: query });
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Place search failed (${response.status}).`);
      const places = await response.json();
      if (places.length === 0) throw new Error("No matching place found. Try a fuller campus name or address.");
      const center = { lat: Number(places[0].lat), lon: Number(places[0].lon) };
      state.map.setView([center.lat, center.lon], 17);
      await loadPaths(center);
    } catch (error) {
      showState(`${error.message} Check internet access and try again.`, "is-error");
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      showState("This browser does not provide location access. Search for the campus instead.", "is-error");
      return;
    }
    showState("Waiting for location permission…", "is-loading");
    navigator.geolocation.getCurrentPosition(
      position => {
        const center = { lat: position.coords.latitude, lon: position.coords.longitude };
        state.map.setView([center.lat, center.lon], 17);
        loadPaths(center);
      },
      error => {
        const message = error.code === error.PERMISSION_DENIED
          ? "Location permission was denied. Search for the campus by name or address instead."
          : "Could not determine your location. Search for the campus by name or address instead.";
        showState(message, "is-error");
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 }
    );
  }

  function nearestNode(point) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const node of state.nodes.values()) {
      const distance = haversineMeters(point, node);
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
    return nearestDistance <= MAX_SNAP_METERS ? { node: nearest, meters: nearestDistance } : null;
  }

  function chooseMapPoint(event) {
    if (!state.nextPick || state.nodes.size === 0) return;
    const point = { lat: event.latlng.lat, lon: event.latlng.lng };
    const snapped = nearestNode(point);
    if (!snapped) {
      ui.instruction.textContent = "No mapped path within 220 m. Zoom or click closer to a path.";
      return;
    }
    const field = state.nextPick;
    state.endpoints[field] = snapped.node.id;
    ui[`${field}Label`].textContent = `${snapped.node.lat.toFixed(5)}, ${snapped.node.lon.toFixed(5)}`;
    if (state.markers[field]) state.map.removeLayer(state.markers[field]);
    state.markers[field] = window.L.circleMarker([snapped.node.lat, snapped.node.lon], {
      radius: 8,
      color: field === "start" ? "#267457" : "#d46b3c",
      weight: 3,
      fillColor: "#fff",
      fillOpacity: 1
    }).addTo(state.map);
    state.markers[field].bindTooltip(field === "start" ? "Route start" : "Route destination");
    state.nextPick = null;
    ui.startButton.classList.remove("is-picking");
    ui.destinationButton.classList.remove("is-picking");
    ui.instruction.textContent = `${field === "start" ? "Start" : "Destination"} snapped to a mapped path (${Math.round(snapped.meters)} m).`;
    if (state.endpoints.start && state.endpoints.destination) {
      showState("Both route points are set. Calculate a route to highlight the mapped path.");
    }
  }

  function pickPoint(field) {
    if (state.nodes.size === 0) {
      ui.instruction.textContent = "Load a real-world map before choosing route points.";
      return;
    }
    state.nextPick = field;
    ui.startButton.classList.toggle("is-picking", field === "start");
    ui.destinationButton.classList.toggle("is-picking", field === "destination");
    ui.instruction.textContent = `Click a walking path on the map to set the ${field}.`;
  }

  class Heap {
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
          if (child + 1 < this.items.length && this.items[child + 1].distance < this.items[child].distance) child++;
          if (last.distance <= this.items[child].distance) break;
          this.items[index] = this.items[child];
          index = child;
        }
        this.items[index] = last;
      }
      return first;
    }
  }

  function predictSegment(segment) {
    const capacities = {
      footway: 32,
      path: 24,
      steps: 14,
      pedestrian: 48,
      service: 62,
      residential: 58,
      tertiary: 66,
      secondary: 74,
      primary: 82,
      unclassified: 48,
      track: 24
    };
    const featureRisks = {
      footway: 0.36,
      path: 0.48,
      steps: 0.88,
      pedestrian: 0.24,
      service: 0.16,
      residential: 0.2,
      tertiary: 0.22,
      secondary: 0.25,
      primary: 0.3,
      unclassified: 0.28,
      track: 0.42
    };
    const capacity = capacities[segment.highway] || 36;
    const risk = window.campusRiskModel.probability({
      ...state.scenario,
      capacity,
      featureRisk: featureRisks[segment.highway] || 0.3
    });
    return { risk, capacity, name: segment.name, minutes: segment.minutes };
  }

  function calculateRoute(start, destination) {
    const distances = new Map(Array.from(state.nodes.keys(), id => [id, Infinity]));
    const parents = new Map();
    const visited = new Set();
    const heap = new Heap();
    distances.set(start, 0);
    heap.push({ node: start, distance: 0 });

    while (heap.items.length > 0) {
      const current = heap.pop();
      if (visited.has(current.node) || current.distance !== distances.get(current.node)) continue;
      visited.add(current.node);
      if (current.node === destination) break;
      for (const edge of state.adjacency.get(current.node) || []) {
        if (["emergency", "accessible"].includes(state.mode) && edge.segment.highway === "steps") continue;
        let edgeCost = edge.segment.meters;
        let prediction = null;
        if (state.mode === "evacuation") {
          prediction = predictSegment(edge.segment);
          const predictedMinutes = window.campusRiskModel.adjustedMinutes(
            edge.segment.minutes, state.scenario.crowd, prediction.risk);
          edgeCost = predictedMinutes * (1 + prediction.risk * 1.6);
        }
        const candidate = current.distance + edgeCost;
        if (candidate < distances.get(edge.node)) {
          distances.set(edge.node, candidate);
          parents.set(edge.node, { node: current.node, segment: edge.segment, prediction });
          heap.push({ node: edge.node, distance: candidate });
        }
      }
    }
    if (!Number.isFinite(distances.get(destination))) return null;

    const nodes = [destination];
    const segments = [];
    const predictions = [];
    let current = destination;
    while (current !== start) {
      const parent = parents.get(current);
      if (!parent) return null;
      segments.unshift(parent.segment);
      if (parent.prediction) predictions.unshift(parent.prediction);
      nodes.unshift(parent.node);
      current = parent.node;
    }
    const meters = segments.reduce((total, segment) => total + segment.meters, 0);
    const summary = state.mode === "evacuation"
      ? window.campusRiskModel.summarize(predictions, state.scenario.evacuees, state.scenario.crowd)
      : null;
    return {
      nodes: nodes.map(id => state.nodes.get(id)),
      segments,
      meters,
      minutes: summary ? summary.walkingMinutes : Math.max(1, Math.round(meters / WALKING_METERS_PER_MINUTE)),
      mode: state.mode,
      ...(summary || {})
    };
  }

  function displayRoute(route) {
    if (!route) {
      ui.routeOutput.innerHTML = '<div class="result-empty"><span class="result-index">ROUTE OUTPUT / NO PATH</span><p class="result-warning">No connected mapped path was found between these points.</p></div>';
      return;
    }
    const distanceText = route.meters >= 1000
      ? `${(route.meters / 1000).toFixed(2)} <small>km</small>`
      : `${Math.round(route.meters)} <small>m</small>`;
    const modeText = route.mode === "emergency"
      ? "EMERGENCY ESTIMATE"
      : route.mode === "accessible" ? "STEP-FREE ESTIMATE" : route.mode === "evacuation" ? "RISK-OPTIMIZED" : "WALKING ESTIMATE";
    const first = route.nodes[0];
    const last = route.nodes[route.nodes.length - 1];
    const labels = route.segments.slice(0, 5).map(segment =>
      `<div class="result-leg"><span>${escapeHTML(segment.name)}</span><span>${Math.round(segment.meters)} m</span></div>`
    ).join("");
    const evacuationSummary = route.mode === "evacuation"
      ? `<div class="evacuation-summary"><div><span>Predicted route risk</span><strong>${route.riskPercent}%</strong></div><div><span>Clearance estimate</span><strong>${route.clearanceMinutes} min</strong></div><p>Bottleneck: ${escapeHTML(route.bottleneck)} · approx. ${route.capacityPerMinute} people/min</p></div>`
      : "";
    ui.routeOutput.innerHTML = `<div class="result-heading"><div><span class="result-index">OPENSTREETMAP ROUTE / ${String(state.history.length + 1).padStart(2, "0")}</span><strong>${distanceText}</strong><span class="route-time-estimate">ABOUT ${route.minutes} MIN ON FOOT</span></div><span class="result-mode ${route.mode}">${modeText}</span></div>` +
      `<p class="result-path">${first.lat.toFixed(5)}, ${first.lon.toFixed(5)} → ${last.lat.toFixed(5)}, ${last.lon.toFixed(5)}</p>` +
      `<div class="result-legs">${labels}${route.segments.length > 5 ? `<div class="result-leg"><span>Additional mapped segments</span><span>+${route.segments.length - 5}</span></div>` : ""}</div>` +
      evacuationSummary +
      `<p class="result-warning">${route.mode === "accessible" ? "OSM accessibility tags may be incomplete. Verify step-free access on site." : route.mode === "evacuation" ? "Scenario heuristic, not trained AI. No live crowd, incident, or closure feed." : "Estimate from mapped paths only. Verify access and current conditions on site."}</p>`;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function rememberRoute(route) {
    const first = route.nodes[0];
    const last = route.nodes[route.nodes.length - 1];
    state.history.unshift({
      mode: route.mode,
      minutes: route.minutes,
      meters: route.meters,
      from: `${first.lat.toFixed(4)}, ${first.lon.toFixed(4)}`,
      to: `${last.lat.toFixed(4)}, ${last.lon.toFixed(4)}`,
      time: new Date()
    });
    ui.activityCount.textContent = String(state.history.length).padStart(2, "0");
    ui.routeHistory.replaceChildren();
    state.history.slice(0, 5).forEach(item => {
      const entry = document.createElement("article");
      entry.className = `history-item ${item.mode}`;
      const title = document.createElement("div");
      title.className = "history-title";
      title.textContent = `${item.from} → ${item.to}`;
      const distance = document.createElement("span");
      distance.textContent = item.meters >= 1000 ? `${(item.meters / 1000).toFixed(2)} km` : `${Math.round(item.meters)} m`;
      title.append(distance);
      const meta = document.createElement("div");
      meta.className = "history-meta";
      const modeLabel = item.mode === "emergency" ? "Emergency estimate" : item.mode === "accessible" ? "Step-free estimate" : item.mode === "evacuation" ? "Evacuation prediction" : "Walking estimate";
      meta.textContent = `${modeLabel} · ${item.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      entry.append(title, meta);
      ui.routeHistory.append(entry);
    });
  }

  function findRoute(event) {
    event.preventDefault();
    const { start, destination } = state.endpoints;
    if (!state.nodes.size) {
      ui.instruction.textContent = "Search for a place or use your location to load paths first.";
      return;
    }
    if (!start || !destination) {
      ui.instruction.textContent = "Choose both start and destination points on the map.";
      return;
    }
    if (start === destination) {
      ui.instruction.textContent = "Start and destination must be different points.";
      return;
    }
    const route = calculateRoute(start, destination);
    displayRoute(route);
    state.routeLayer.clearLayers();
    if (!route) return;
    const color = route.mode === "emergency" ? "#d46b3c" : route.mode === "accessible" ? "#438695" : route.mode === "evacuation" ? "#bd674b" : "#267457";
    window.L.polyline(route.nodes.map(node => [node.lat, node.lon]), {
      color,
      weight: 7,
      opacity: 0.92,
      lineCap: "round",
      lineJoin: "round"
    }).addTo(state.routeLayer);
    state.map.fitBounds(state.routeLayer.getBounds().pad(0.18), { maxZoom: 18 });
    rememberRoute(route);
  }

  function displayReachable() {
    const start = state.endpoints.start;
    if (!start) {
      ui.nearbyOutput.hidden = false;
      ui.nearbyOutput.textContent = "Pick a start point on the real-world map first.";
      return;
    }
    const visited = new Set([start]);
    const queue = [start];
    for (let front = 0; front < queue.length; front++) {
      for (const edge of state.adjacency.get(queue[front]) || []) {
        if (!visited.has(edge.node)) {
          visited.add(edge.node);
          queue.push(edge.node);
        }
      }
    }
    ui.nearbyOutput.hidden = false;
    ui.nearbyOutput.textContent = `${visited.size.toLocaleString()} connected path points reachable from the selected start.`;
  }

  ui.searchForm.addEventListener("submit", searchPlace);
  ui.locationButton.addEventListener("click", useMyLocation);
  ui.startButton.addEventListener("click", () => pickPoint("start"));
  ui.destinationButton.addEventListener("click", () => pickPoint("destination"));
  ui.radius.addEventListener("change", () => {
    if (state.center) loadPaths(state.center);
  });

  window.liveCampusMap = { enable, disable, setMode, setScenario, findRoute, displayReachable };
})();