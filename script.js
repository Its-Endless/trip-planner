// === Config ===

// Detect mode based on HTML attribute
const MODE = document.documentElement.getAttribute("data-mode") || "day-out";

// Use different n8n webhooks / agents for each mode
// TODO: replace these with your actual n8n webhook URLs
const dayOutWebhookUrl = "https://5jsanjhv.rpcl.app/webhook/plan-trip";
const tripPlannerWebhookUrl = "https://5jsanjhv.rpcl.app/webhook/plan-trip-multi";

const webhookUrl = MODE === "trip-planner" ? tripPlannerWebhookUrl : dayOutWebhookUrl;

// Restrict geocoding to a specific country if you want (e.g., "in" for India)
const GEOCODE_COUNTRY_HINT = "";

// DOM references
const chatContainer = document.getElementById("chat-container");
const promptInput = document.getElementById("userPrompt");
const submitBtn = document.getElementById("submitBtn");
const reEvalBtn = document.getElementById("reEvalBtn");
const shareTripBtn = document.getElementById("shareTripBtn");
const themeToggle = document.getElementById("themeToggle"); // kept but unused
const body = document.body;

const areaTypeContainer = document.getElementById("areaTypeContainer");
const activityTypeContainer = document.getElementById("activityTypeContainer");
const preferencesPanel = document.querySelector(".preferences-panel");
const toggleMapSizeBtn = document.getElementById("toggleMapSizeBtn");
const likeBtn = document.getElementById("likeBtn");
const dislikeBtn = document.getElementById("dislikeBtn");

// Sidebar lists
const tripListEl = document.getElementById("tripList");
const favouriteListEl = document.getElementById("favouriteList");

// AUTH DOM
const loginBtn = document.querySelector('.auth-btn[data-auth="login"]');
const signupBtn = document.querySelector('.auth-btn[data-auth="signup"]');
const authOverlay = document.getElementById("authOverlay");
const authCloseBtn = document.getElementById("authCloseBtn");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authForm = document.getElementById("authForm");
const authEmailInput = document.getElementById("authEmail");
const authPasswordInput = document.getElementById("authPassword");
const authSubmitBtn = document.getElementById("authSubmitBtn");
const authMessage = document.getElementById("authMessage");

let authMode = "login"; // "login" or "signup"
let currentUser = null;

// Trip state
let lastPayload = null;
let lastResponse = null;
let currentTripId = null;

// ==== Map state ====
let map;
let markersLayer;
let routeLayer;
let userMarker;

// === Preference option pools (randomized on each load) ===
const AREA_TYPES = [
  "Mountains", "Beaches", "Cities", "Countryside",
  "Historical", "Lakes", "Forests", "Deserts"
];

const ACTIVITY_TYPES = [
  "Hiking", "Chilling", "Museums", "Nightlife",
  "Food tours", "Shopping", "Adventure sports",
  "Photography spots", "Local culture"
];

// Utility to shuffle an array in-place
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Render randomised checkbox chips for areas / activities
function renderRandomizedChips(container, options, name) {
  if (!container) return;
  container.innerHTML = "";
  const shuffled = shuffleArray([...options]);
  shuffled.forEach((labelText) => {
    const wrapper = document.createElement("label");
    wrapper.className = "pref-chip";
    wrapper.innerHTML = `
      <input type="checkbox" class="hidden-pref" name="${name}" value="${labelText}">
      <span>${labelText}</span>
    `;
    container.appendChild(wrapper);
  });

  // Randomly activate 1–2 options at first render
  const inputs = container.querySelectorAll("input[type='checkbox']");
  const countToCheck = Math.min(2, inputs.length);
  shuffleArray([...inputs]).slice(0, countToCheck).forEach((input) => {
    input.checked = true;
    input.parentElement.classList.add("active");
  });
}

// Collect all preference chips into a structured object for the backend
function collectPreferences() {
  const pref = {
    mode: MODE,
    days: [],
    budget_ranges: [],
    area_types: [],
    activity_types: []
  };

  document.querySelectorAll("input[name='days']:checked").forEach((el) => {
    pref.days.push(el.value);
  });
  document.querySelectorAll("input[name='budget']:checked").forEach((el) => {
    pref.budget_ranges.push(el.value);
  });
  document.querySelectorAll("input[name='area-types']:checked").forEach((el) => {
    pref.area_types.push(el.value);
  });
  document.querySelectorAll("input[name='activity-types']:checked").forEach((el) => {
    pref.activity_types.push(el.value);
  });

  return pref;
}

// Toggle chip .active on click
document.addEventListener("click", (e) => {
  const label = e.target.closest(".pref-chip");
  if (!label) return;
  const input = label.querySelector("input");
  if (!input) return;

  setTimeout(() => {
    if (input.type === "radio") {
      const name = input.name;
      // Clear all chips in this radio group
      document
        .querySelectorAll(`input[type="radio"][name="${name}"]`)
        .forEach((radio) => {
          if (radio.checked) {
            radio.parentElement.classList.add("active");
          } else {
            radio.parentElement.classList.remove("active");
          }
        });
    } else {
      // Checkbox (multi-select)
      if (input.checked) {
        label.classList.add("active");
      } else {
        label.classList.remove("active");
      }
    }
  }, 0);
});


// Initialize area & activity chips ONLY for Trip Planner
if (MODE === "trip-planner") {
  renderRandomizedChips(areaTypeContainer, AREA_TYPES, "area-types");
  renderRandomizedChips(activityTypeContainer, ACTIVITY_TYPES, "activity-types");
}

// ========== MAP HELPERS ==========

function ensureMap(lat, lng) {
  if (!map) {
    map = L.map("map", { zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);  // route polyline layer
  }
  map.setView([lat, lng], 13);

  if (!userMarker) {
    userMarker = L.marker([lat, lng], { title: "You are here" }).addTo(map);
  } else {
    userMarker.setLatLng([lat, lng]);
  }
}

function updateMapWithLocations(locs) {
  if (!map || !markersLayer || !routeLayer) return;

  // Clear previous POI markers and route
  markersLayer.clearLayers();
  routeLayer.clearLayers();

  const bounds = [];
  const pathCoords = [];

  locs.forEach((p) => {
    if (typeof p.lat !== "number" || typeof p.lng !== "number") return;
    const title = p.title || p.name || p.place || "Location";
    const desc = p.description || p.reason || "";
    const marker = L.marker([p.lat, p.lng], { title });
    marker.bindPopup(`<strong>${escapeHtml(title)}</strong><br>${escapeHtml(desc)}`);
    markersLayer.addLayer(marker);
    bounds.push([p.lat, p.lng]);
    pathCoords.push([p.lat, p.lng]);
  });

  // Draw a polyline for the route (circuit) if at least 2 points
  if (pathCoords.length >= 2) {
    const polyline = L.polyline(pathCoords, {
      weight: 4,
      opacity: 0.8
    });
    routeLayer.addLayer(polyline);
  }

  // Include user location in bounds if present
  if (userMarker) {
    bounds.push(userMarker.getLatLng());
  }

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [24, 24] });
  }
}
document.body.classList.add("show-map");

// Expand / collapse map size
toggleMapSizeBtn?.addEventListener("click", () => {
  body.classList.toggle("map-expanded");
});

// Extract locations from backend structured data
function extractLocationsFromResponse(finalData) {
  if (finalData && typeof finalData === "object" && Array.isArray(finalData.locations)) {
    return finalData.locations.filter(
      (p) => p && typeof p.lat === "number" && typeof p.lng === "number"
    );
  }

  const out = [];

  if (finalData && typeof finalData === "object" && Array.isArray(finalData.days)) {
    finalData.days.forEach((day) => {
      (day.activities || []).forEach((step) => {
        if (typeof step.lat === "number" && typeof step.lng === "number") {
          out.push({
            lat: step.lat,
            lng: step.lng,
            title: step.place || step.title,
            description: step.reason || step.description || ""
          });
        } else if (Array.isArray(step.coordinates) && step.coordinates.length === 2) {
          const [lat, lng] = step.coordinates;
          if (typeof lat === "number" && typeof lng === "number") {
            out.push({
              lat,
              lng,
              title: step.place || step.title,
              description: step.reason || step.description || ""
            });
          }
        }
      });
    });
  }

  if (finalData && typeof finalData === "object" && Array.isArray(finalData.itinerary)) {
    finalData.itinerary.forEach((step) => {
      if (typeof step?.lat === "number" && typeof step?.lng === "number") {
        out.push({
          lat: step.lat,
          lng: step.lng,
          title: step.place,
          description: step.reason
        });
      } else if (Array.isArray(step?.coordinates) && step.coordinates.length === 2) {
        const [lat, lng] = step.coordinates;
        if (typeof lat === "number" && typeof lng === "number") {
          out.push({
            lat,
            lng,
            title: step.place,
            description: step.reason
          });
        }
      }
    });
  }

  return out;
}

// Try to geocode place strings when no lat/lng provided
async function geocodePlace(q, bias) {
  // First try: biased around user location (if available)
  const paramsBiased = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "0",
    limit: "1",
    ...(GEOCODE_COUNTRY_HINT ? { countrycodes: GEOCODE_COUNTRY_HINT } : {})
  });

  if (bias && typeof bias.lat === "number" && typeof bias.lng === "number") {
    const lat = bias.lat;
    const lng = bias.lng;
    const viewbox = `${lng - 0.25},${lat + 0.25},${lng + 0.25},${lat - 0.25}`;
    paramsBiased.set("viewbox", viewbox);
  }

  let url = `https://nominatim.openstreetmap.org/search?${paramsBiased.toString()}`;
  try {
    let res = await fetch(url, { headers: { Accept: "application/json" } });
    let data = await res.json();
    if (Array.isArray(data) && data[0]) {
      return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
    }
  } catch (e) {
    console.warn("Geocode (biased) failed for", q, e);
  }

  // Second try: global search without any bias
  const paramsGlobal = new URLSearchParams({
    q,
    format: "json",
    addressdetails: "0",
    limit: "1",
    ...(GEOCODE_COUNTRY_HINT ? { countrycodes: GEOCODE_COUNTRY_HINT } : {})
  });

  url = `https://nominatim.openstreetmap.org/search?${paramsGlobal.toString()}`;
  try {
    const res2 = await fetch(url, { headers: { Accept: "application/json" } });
    const data2 = await res2.json();
    if (Array.isArray(data2) && data2[0]) {
      return { lat: Number(data2[0].lat), lng: Number(data2[0].lon) };
    }
  } catch (e2) {
    console.warn("Geocode (global) failed for", q, e2);
  }

  return null;
}

async function geocodeFromItinerary(itinerary, userBias) {
  const out = [];
  for (const step of itinerary) {
    const label = step.place || step.title || step.name;
    if (!label) continue;
    const result = await geocodePlace(label, userBias);
    if (result) {
      out.push({
        lat: result.lat,
        lng: result.lng,
        title: label,
        description: step.reason || ""
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

// Extract location names from plain text (bold **names**) and geocode
async function extractAndGeocodeFromText(text, userBias) {
  const names = [];
  const regex = /\*\*(.+?)\*\*/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const name = match[1].trim();
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }

  const locs = [];
  for (const name of names) {
    const result = await geocodePlace(name, userBias);
    if (result) {
      locs.push({
        lat: result.lat,
        lng: result.lng,
        title: name,
        description: ""
      });
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return locs;
}

// Append message to chat
function appendMessage(sender, htmlText) {
  const bubble = document.createElement("div");
  bubble.classList.add("chat-bubble", sender);
  bubble.innerHTML = htmlText;
  chatContainer.appendChild(bubble);
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

// Robust JSON parsing
async function parseJSONSafe(res) {
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();

  if (!text) return {};

  if (ct.includes("application/json")) {
    try {
      return JSON.parse(text);
    } catch (e) {
      return { _raw: text, _parseError: e.message };
    }
  }
  return text;
}

// Call backend
async function sendToWebhook(payload) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    return await parseJSONSafe(res);
  } catch (err) {
    return { error: err.message };
  }
}

// === RENDERING ===

function formatRichTripPlan(data) {
  let message = "";

  if (Array.isArray(data.days) && data.days.length) {
    message += `<div class="trip-section-title">Itinerary by Day</div>`;
    data.days.forEach((day, index) => {
      const label = day.label || `Day ${day.day || index + 1}`;
      const dateStr = day.date ? `${escapeHtml(day.date)}` : "";
      const summary = day.summary ? escapeHtml(day.summary) : "";
      message += `
        <div class="day-card">
          <div class="day-card-header">
            <span>${escapeHtml(label)}</span>
            <span>${dateStr}</span>
          </div>
          ${summary ? `<div style="font-size:12px; margin-bottom:4px;">${summary}</div>` : ""}
          <div class="day-card-activities">
      `;
      (day.activities || []).forEach((act) => {
        const time = act.time_of_day || act.time || "";
        const place = act.place || act.title || "";
        const reason = act.reason || act.description || "";
        const estCost = act.estimated_cost || "";
        message += `
          <div class="day-activity">
            <div class="day-activity-time">${escapeHtml(time)}</div>
            <div class="day-activity-main">
              <strong>${escapeHtml(place)}</strong>
              ${estCost ? ` <span style="font-size:11px; color:#b0b0b0;">(${escapeHtml(estCost)})</span>` : ""}
              ${reason ? `<div style="font-size:12px;">${escapeHtml(reason)}</div>` : ""}
            </div>
          </div>
        `;
      });
      message += `</div></div>`;
    });
  }

  if (Array.isArray(data.itinerary) && data.itinerary.length && !Array.isArray(data.days)) {
    message += `<div class="trip-section-title">Plan</div>`;
    data.itinerary.forEach((step) => {
      message += `<div style="margin-bottom: 10px;">
        <strong>${escapeHtml(step.step != null ? `Step ${step.step}` : "Spot")}:</strong> ${escapeHtml(step.place ?? "")} 
        ${step.estimated_cost ? `(<span>${escapeHtml(step.estimated_cost)}</span>)` : ""}<br>
        <em>Reason:</em> ${escapeHtml(step.reason ?? "")}
      </div>`;
    });
  }

  if (Array.isArray(data.flights) && data.flights.length) {
    message += `<div class="trip-section-title">Suggested Flights</div><div class="trip-card-list">`;
    data.flights.forEach((f) => {
      message += `
        <div class="trip-card">
          <div class="trip-card-header">
            <span>${escapeHtml(f.airline || "Flight")}</span>
            <span>${escapeHtml(f.price || "")}</span>
          </div>
          <div class="trip-card-sub">
            ${escapeHtml(f.from || "")} → ${escapeHtml(f.to || "")}<br>
            ${escapeHtml(f.depart_time || "")} – ${escapeHtml(f.arrive_time || "")}
          </div>
          ${f.booking_url ? `<div class="trip-card-link"><a href="${escapeHtml(f.booking_url)}" target="_blank" rel="noopener noreferrer">Book / View on site</a></div>` : ""}
        </div>
      `;
    });
    message += `</div>`;
  }

  if (Array.isArray(data.hotels) && data.hotels.length) {
    message += `<div class="trip-section-title">Where to Stay</div><div class="trip-card-list">`;
    data.hotels.forEach((h) => {
      message += `
        <div class="trip-card">
          <div class="trip-card-header">
            <span>${escapeHtml(h.name || "Stay")}</span>
            <span>${escapeHtml(h.total_price || h.price_per_night || "")}</span>
          </div>
          <div class="trip-card-sub">
            ${escapeHtml(h.address || "")}<br>
            ${h.rating ? `Rating: ${escapeHtml(String(h.rating))} | ` : ""}${h.nights ? `${escapeHtml(String(h.nights))} nights` : ""}
          </div>
          ${h.booking_url ? `<div class="trip-card-link"><a href="${escapeHtml(h.booking_url)}" target="_blank" rel="noopener noreferrer">Book / View on site</a></div>` : ""}
        </div>
      `;
    });
    message += `</div>`;
  }

  if (Array.isArray(data.transport) && data.transport.length) {
    message += `<div class="trip-section-title">Local Transport</div><div class="trip-card-list">`;
    data.transport.forEach((t) => {
      message += `
        <div class="trip-card">
          <div class="trip-card-header">
            <span>${escapeHtml(t.type || "Transport")}</span>
            <span>${escapeHtml(t.price || "")}</span>
          </div>
          <div class="trip-card-sub">
            ${escapeHtml(t.from || "")} → ${escapeHtml(t.to || "")}<br>
            ${escapeHtml(t.depart_time || "")} ${t.duration ? `• ${escapeHtml(t.duration)}` : ""}
          </div>
        </div>
      `;
    });
    message += `</div>`;
  }

  if (data.budget && typeof data.budget === "object") {
    message += `<div class="trip-section-title">Budget Overview</div>`;
    const total = data.budget.total || data.total_estimated_cost;
    const breakdown = data.budget.breakdown || {};
    message += `<div class="budget-summary">
      ${total ? `<div><strong>Total Estimated Cost:</strong> ${escapeHtml(total)}</div>` : ""}
    `;
    Object.keys(breakdown).forEach((k) => {
      message += `<div>${escapeHtml(k)}: ${escapeHtml(String(breakdown[k]))}</div>`;
    });
    message += `</div>`;
  } else if (data.total_estimated_cost) {
    message += `<div class="budget-summary">
      <strong>Total Estimated Cost:</strong> ${escapeHtml(data.total_estimated_cost)}
    </div>`;
  }

  if (data.weather && typeof data.weather === "object") {
    message += `<div class="trip-section-title">Weather & Activity Suggestions</div>`;
    message += `<div class="weather-summary">`;
    if (data.weather.summary) {
      message += `<div>${escapeHtml(data.weather.summary)}</div>`;
    }
    if (Array.isArray(data.weather.daily)) {
      data.weather.daily.forEach((d) => {
        message += `<div style="margin-top:4px;">
          <strong>${escapeHtml(d.date || "")}</strong>: ${escapeHtml(d.condition || "")} 
          ${
            d.temp_min != null && d.temp_max != null
              ? `(${escapeHtml(String(d.temp_min))}–${escapeHtml(String(d.temp_max))}°)`
              : ""
          }
          ${
            Array.isArray(d.suggested_activities) && d.suggested_activities.length
              ? `<br><span style="font-size:12px;">Try: ${escapeHtml(
                  d.suggested_activities.join(", ")
                )}</span>`
              : ""
          }
        </div>`;
      });
    }
    message += `</div>`;
  }

  if (data.time_of_day && !data.weather) {
    message += `<div style="margin-top:6px;font-size:12px;">
      <strong>Time of Day:</strong> ${escapeHtml(data.time_of_day)}
    </div>`;
  }

  return message || null;
}

function formatItinerary(data) {
  if (!data) return null;
  if (typeof data === "object") {
    const rich = formatRichTripPlan(data);
    if (rich) return rich;
  }

  if (typeof data === "object" && Array.isArray(data.itinerary)) {
    let message = "";
    data.itinerary.forEach((step) => {
      message += `<div style="margin-bottom: 10px;">
        <strong>Step ${step.step ?? ""}:</strong> ${escapeHtml(step.place ?? "")} 
        ${step.estimated_cost ? `(${escapeHtml(step.estimated_cost)})` : ""}<br>
        <em>Reason:</em> ${escapeHtml(step.reason ?? "")}
      </div>`;
    });
    message += `<div><strong>Total Estimated Cost:</strong> ${escapeHtml(data.total_estimated_cost ?? "")}<br>
    <strong>Time of Day:</strong> ${escapeHtml(data.time_of_day ?? "")}</div>`;
    return message;
  }

  return null;
}

// ===== MAIN CHAT FLOW =====

function makeTypingBubble() {
  const typingBubble = document.createElement("div");
  typingBubble.classList.add("chat-bubble", "bot", "typing");
  typingBubble.textContent = "Typing...";
  chatContainer.appendChild(typingBubble);
  return typingBubble;
}

submitBtn.addEventListener("click", () => {
  const prompt = (promptInput.value || "").trim();
  if (!prompt) {
    alert("Please enter something!");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;

      const preferences = collectPreferences();

      lastPayload = {
        mode: MODE,
        user_prompt: prompt,
        user_location: { lat, lng },
        preferences
      };

      ensureMap(lat, lng);

      appendMessage("user", escapeHtml(prompt));
      promptInput.value = "";
      submitBtn.disabled = true;
      reEvalBtn.disabled = true;
      if (shareTripBtn) shareTripBtn.disabled = true;
      if (likeBtn) likeBtn.disabled = true;
      if (dislikeBtn) dislikeBtn.disabled = true;

      const typingBubble = makeTypingBubble();

      const response = await sendToWebhook(lastPayload);
      typingBubble.remove();

      await handleBackendResponse(response, { lat, lng });

      submitBtn.disabled = false;

      // for Trip Planner: after first answer, hide filters permanently
      if (MODE === "trip-planner" && preferencesPanel) {
        preferencesPanel.classList.add("collapsed");
      }
    },
    (err) => {
      alert("Location permission is required to personalize the map: " + err.message);
    }
  );
});

// Re-evaluate with user refinement text
reEvalBtn.addEventListener("click", async () => {
  if (!lastPayload) return;

  const refinement = promptInput.value.trim();
  if (!refinement) {
    alert("Type your updated preferences in the box, then click Re-evaluate.");
    return;
  }

  appendMessage("user", escapeHtml(refinement));

  const newPayload = {
    ...lastPayload,
    user_prompt: `${lastPayload.user_prompt}\n\nUser update / refinement: ${refinement}`
  };

  lastPayload = newPayload;

  promptInput.value = "";

  reEvalBtn.disabled = true;
  if (shareTripBtn) shareTripBtn.disabled = true;
  if (likeBtn) likeBtn.disabled = true;
  if (dislikeBtn) dislikeBtn.disabled = true;

  const typingBubble = document.createElement("div");
  typingBubble.classList.add("chat-bubble", "bot", "typing");
  typingBubble.textContent = "Typing.";
  chatContainer.appendChild(typingBubble);

  const response = await sendToWebhook(newPayload);

  document.querySelector(".typing")?.remove();

  if (response && response.error) {
    appendMessage("bot", "Error: " + escapeHtml(response.error));
  } else {
    let finalData;

    if (Array.isArray(response)) {
      const body = response[0]?.response?.body;
      finalData = body !== undefined ? body : response;
    } else {
      finalData = response;
    }

    if (finalData && typeof finalData === "object" && finalData._parseError) {
      appendMessage("bot", "Error: Failed to parse backend JSON. Showing raw text.");
      if (finalData._raw) finalData = finalData._raw;
    }

    const formatted = formatItinerary(finalData);
    if (formatted) {
      appendMessage("bot", formatted);
    } else if (typeof finalData === "string") {
      appendMessage("bot", escapeHtml(finalData).replaceAll("\n", "<br>"));
    } else {
      appendMessage("bot", `<pre>${escapeHtml(JSON.stringify(finalData, null, 2))}</pre>`);
    }

    let locs = extractLocationsFromResponse(finalData);
    if (!locs.length && finalData && typeof finalData === "object" && Array.isArray(finalData.itinerary)) {
      try {
        const bias = lastPayload?.user_location;
        locs = await geocodeFromItinerary(finalData.itinerary, bias);
      } catch (e) {
        console.warn("Geocoding failed:", e);
      }
    }
    if (!locs.length && typeof finalData === "string") {
      try {
        const bias = lastPayload?.user_location;
        locs = await extractAndGeocodeFromText(finalData, bias);
      } catch (e) {
        console.warn("Text geocoding failed:", e);
      }
    }
    if (locs.length) updateMapWithLocations(locs);

    reEvalBtn.disabled = false;
    if (shareTripBtn) shareTripBtn.disabled = false;
    if (likeBtn) likeBtn.disabled = false;
    if (dislikeBtn) dislikeBtn.disabled = false;
  }
});

// Central handler for backend responses
async function handleBackendResponse(response, userBias) {
  if (response && response.error) {
    appendMessage("bot", "Error: " + escapeHtml(response.error));
    return;
  }

  let finalData;

  if (Array.isArray(response)) {
    const body = response[0]?.response?.body;
    finalData = body !== undefined ? body : response;
  } else {
    finalData = response;
  }

  if (finalData && typeof finalData === "object" && finalData._parseError) {
    appendMessage("bot", "Error: Failed to parse backend JSON. Showing raw text.");
    if (finalData._raw) {
      finalData = finalData._raw;
    }
  }

  lastResponse = finalData;

  const formatted = formatItinerary(finalData);

  if (formatted) {
    appendMessage("bot", formatted);
  } else {
    if (typeof finalData === "string") {
      appendMessage("bot", escapeHtml(finalData).replaceAll("\n", "<br>"));
    } else {
      appendMessage("bot", `<pre>${escapeHtml(JSON.stringify(finalData, null, 2))}</pre>`);
    }
  }

  let locs = extractLocationsFromResponse(finalData);
  if (!locs.length && finalData && typeof finalData === "object" && Array.isArray(finalData.itinerary)) {
    try {
      locs = await geocodeFromItinerary(finalData.itinerary, userBias);
    } catch (e) {
      console.warn("Geocoding failed:", e);
    }
  }
  if (!locs.length && typeof finalData === "string") {
    try {
      locs = await extractAndGeocodeFromText(finalData, userBias);
    } catch (e) {
      console.warn("Text geocoding failed:", e);
    }
  }
  if (locs.length) updateMapWithLocations(locs);

  reEvalBtn.disabled = false;
  if (shareTripBtn) shareTripBtn.disabled = false;
  if (likeBtn) likeBtn.disabled = false;
  if (dislikeBtn) dislikeBtn.disabled = false;

  // Save trip to "My Trips"
  saveTripToHistory(false);
}

// SHARE TRIP (collaboration) – using payload + response
shareTripBtn?.addEventListener("click", async () => {
  if (!lastPayload && !lastResponse) return;

  let shareUrl = null;

  if (!shareUrl && lastPayload) {
    try {
      const toShare = {
        payload: lastPayload,
        response: lastResponse || null
      };
      const encoded = btoa(encodeURIComponent(JSON.stringify(toShare)));

      const params = new URLSearchParams();
      params.set("mode", MODE);
      params.set("trip", encoded);

      shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    } catch {
      shareUrl = window.location.href;
    }
  }

  if (!shareUrl) return;

  try {
    await navigator.clipboard.writeText(shareUrl);
    alert("Shareable link copied to clipboard!");
  } catch {
    prompt("Copy this trip link:", shareUrl);
  }
});

// LIKE / DISLIKE logic (favourites)
likeBtn?.addEventListener("click", () => {
  if (!currentTripId) return;
  markTripLiked(currentTripId, true);
  likeBtn.classList.add("liked");
  dislikeBtn?.classList.remove("disliked");
});

dislikeBtn?.addEventListener("click", () => {
  if (!currentTripId) return;
  markTripLiked(currentTripId, false);
  dislikeBtn.classList.add("disliked");
  likeBtn?.classList.remove("liked");
});

// Trip history in localStorage
function loadTripHistory() {
  try {
    const raw = localStorage.getItem("tripHistory");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTripHistory(trips) {
  try {
    localStorage.setItem("tripHistory", JSON.stringify(trips));
  } catch {
    // ignore
  }
}

function deleteTrip(id) {
  const trips = loadTripHistory();
  const filtered = trips.filter((t) => t.id !== id);
  saveTripHistory(filtered);
  if (currentTripId === id) currentTripId = null;
  renderTripHistory();
}

function saveTripToHistory(initialLiked) {
  if (!lastPayload || !lastResponse) return;

  const trips = loadTripHistory();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const record = {
    id,
    mode: MODE,
    prompt: lastPayload.user_prompt || "",
    payload: lastPayload,
    response: lastResponse,
    createdAt: Date.now(),
    liked: !!initialLiked
  };

  trips.unshift(record);
  if (trips.length > 30) trips.length = 30;

  saveTripHistory(trips);
  currentTripId = id;
  renderTripHistory();
}

function markTripLiked(id, liked) {
  const trips = loadTripHistory();
  const idx = trips.findIndex((t) => t.id === id);
  if (idx === -1) return;
  trips[idx].liked = liked;
  saveTripHistory(trips);
  renderTripHistory();
}

function renderTripHistory() {
  const trips = loadTripHistory();

  if (tripListEl) tripListEl.innerHTML = "";
  if (favouriteListEl) favouriteListEl.innerHTML = "";

  trips.forEach((trip) => {
    const label =
      (trip.mode === "trip-planner" ? "Trip: " : "Day Out: ") +
      (trip.prompt || "Untitled");

    const li = document.createElement("li");
    li.dataset.tripId = trip.id;

    const textSpan = document.createElement("span");
    textSpan.textContent = label.length > 40 ? `${label.slice(0, 40)}…` : label;

    const deleteBtn = document.createElement("span");
    deleteBtn.className = "trip-delete-btn";
    deleteBtn.textContent = "🗑";

    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteTrip(trip.id);
    });

    li.appendChild(textSpan);
    li.appendChild(deleteBtn);

    li.addEventListener("click", () => loadTripFromHistory(trip.id));

    if (tripListEl) tripListEl.appendChild(li);

    if (trip.liked && favouriteListEl) {
      const favLi = document.createElement("li");
      favLi.dataset.tripId = trip.id;

      const favTextSpan = document.createElement("span");
      favTextSpan.textContent = label.length > 40 ? `${label.slice(0, 40)}…` : label;

      const favDeleteBtn = document.createElement("span");
      favDeleteBtn.className = "trip-delete-btn";
      favDeleteBtn.textContent = "🗑";

      favDeleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteTrip(trip.id);
      });

      favLi.appendChild(favTextSpan);
      favLi.appendChild(favDeleteBtn);

      favLi.addEventListener("click", () => loadTripFromHistory(trip.id));

      favouriteListEl.appendChild(favLi);
    }
  });
}

function loadTripFromHistory(id) {
  const trips = loadTripHistory();
  const record = trips.find((t) => t.id === id);
  if (!record) return;

  currentTripId = id;
  lastPayload = record.payload;
  lastResponse = record.response;

  chatContainer.innerHTML = "";
  appendMessage("user", escapeHtml(record.prompt || ""));
  const formatted = formatItinerary(record.response);
  if (formatted) {
    appendMessage("bot", formatted);
  } else {
    if (typeof record.response === "string") {
      appendMessage("bot", escapeHtml(record.response).replaceAll("\n", "<br>"));
    } else {
      appendMessage("bot", `<pre>${escapeHtml(JSON.stringify(record.response, null, 2))}</pre>`);
    }
  }

  reEvalBtn.disabled = false;
  if (shareTripBtn) shareTripBtn.disabled = false;
  if (likeBtn) likeBtn.disabled = false;
  if (dislikeBtn) dislikeBtn.disabled = false;

  const locs = extractLocationsFromResponse(record.response);
  if (locs.length) {
    ensureMap(locs[0].lat, locs[0].lng);
    updateMapWithLocations(locs);
  }

  likeBtn?.classList.remove("liked");
  dislikeBtn?.classList.remove("disliked");
  if (record.liked) {
    likeBtn?.classList.add("liked");
  }
}

// Force dark mode only – no switching
body.classList.remove("light");
body.classList.add("dark");

// Enter to submit
promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitBtn.click();
  }
});

// Escape HTML
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/* Dropdown open/close with click (fix hover issue) */
const dropdown = document.querySelector(".dropdown");
const dropdownBtn = dropdown?.querySelector(".dropdown-btn");

dropdownBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  dropdown.classList.toggle("open");
});

document.addEventListener("click", () => {
  dropdown?.classList.remove("open");
});

// ===== SHARE-LINK RESTORE =====
async function loadSharedTripFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("trip");
  if (!encoded) return;

  try {
    const jsonStr = decodeURIComponent(atob(encoded));
    const data = JSON.parse(jsonStr);

    const payload = data.payload || data;
    const response = data.response || null;

    lastPayload = payload || null;
    lastResponse = response || null;
    currentTripId = null;

    chatContainer.innerHTML = "";

    const promptText = payload?.user_prompt || "Shared trip";
    appendMessage("user", escapeHtml(promptText));

    if (response) {
      const formatted = formatItinerary(response);
      if (formatted) {
        appendMessage("bot", formatted);
      } else if (typeof response === "string") {
        appendMessage("bot", escapeHtml(response).replaceAll("\n", "<br>"));
      } else {
        appendMessage(
          "bot",
          `<pre>${escapeHtml(JSON.stringify(response, null, 2))}</pre>`
        );
      }

      let locs = extractLocationsFromResponse(response);
      if (!locs.length && typeof response === "string") {
        const bias = payload?.user_location;
        try {
          locs = await extractAndGeocodeFromText(response, bias);
        } catch (e) {
          console.warn("Text geocoding for shared trip failed:", e);
        }
      }

      if (locs.length) {
        const first = locs[0];
        ensureMap(first.lat, first.lng);
        updateMapWithLocations(locs);
      }
    }

    reEvalBtn.disabled = !lastPayload;
    if (shareTripBtn) shareTripBtn.disabled = !lastPayload;
    if (likeBtn) likeBtn.disabled = !lastPayload;
    if (dislikeBtn) dislikeBtn.disabled = !lastPayload;
  } catch (e) {
    console.error("Failed to load shared trip from URL:", e);
  }
}

// ===== SUPABASE AUTH ======

function updateAuthButtons() {
  if (!loginBtn || !signupBtn) return;

  if (currentUser) {
    const label = currentUser.email || "Account";
    loginBtn.textContent = label.length > 16 ? label.slice(0, 16) + "…" : label;
    signupBtn.textContent = "Logout";
  } else {
    loginBtn.textContent = "Login";
    signupBtn.textContent = "Sign Up";
  }
}

function openAuthModal(mode) {
  if (!authOverlay) return;
  authMode = mode;

  if (authMode === "login") {
    authTitle.textContent = "Log in";
    authSubtitle.textContent = "Welcome back. Please enter your details.";
    authSubmitBtn.textContent = "Log in";
  } else {
    authTitle.textContent = "Sign up";
    authSubtitle.textContent = "Create an account to save your trips.";
    authSubmitBtn.textContent = "Sign up";
  }

  authEmailInput.value = "";
  authPasswordInput.value = "";
  authMessage.textContent = "";
  authMessage.className = "auth-message";

  authOverlay.classList.add("open");
}

function closeAuthModal() {
  if (!authOverlay) return;
  authOverlay.classList.remove("open");
}

authCloseBtn?.addEventListener("click", closeAuthModal);

authOverlay?.addEventListener("click", (e) => {
  if (e.target === authOverlay) {
    closeAuthModal();
  }
});

loginBtn?.addEventListener("click", () => {
  if (!window.supabaseClient) {
    alert("Supabase is not configured yet. Please add your Supabase URL and anon key in the HTML.");
    return;
  }
  if (currentUser) {
    // In future you could show account details here
    openAuthModal("login");
  } else {
    openAuthModal("login");
  }
});

signupBtn?.addEventListener("click", async () => {
  if (!window.supabaseClient) {
    alert("Supabase is not configured yet. Please add your Supabase URL and anon key in the HTML.");
    return;
  }

  if (currentUser) {
    // Logout
    try {
      await window.supabaseClient.auth.signOut();
      currentUser = null;
      updateAuthButtons();
      alert("Logged out");
    } catch (e) {
      console.error(e);
      alert("Failed to log out: " + e.message);
    }
  } else {
    openAuthModal("signup");
  }
});

authForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!window.supabaseClient) {
    alert("Supabase is not configured yet. Please add your Supabase URL and anon key in the HTML.");
    return;
  }

  const email = authEmailInput.value.trim();
  const password = authPasswordInput.value.trim();
  if (!email || !password) return;

  authSubmitBtn.disabled = true;
  authMessage.textContent = "Working...";
  authMessage.className = "auth-message";

  try {
    if (authMode === "login") {
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email,
        password
      });
      if (error) throw error;
      currentUser = data.user || null;
      authMessage.textContent = "Logged in successfully.";
      authMessage.classList.add("success");
      updateAuthButtons();
      setTimeout(closeAuthModal, 800);
    } else {
      const { data, error } = await window.supabaseClient.auth.signUp({
        email,
        password
      });
      if (error) throw error;
      authMessage.textContent = "Sign up successful. Please check your email to confirm.";
      authMessage.classList.add("success");
    }
  } catch (err) {
    console.error(err);
    authMessage.textContent = err.message || "Something went wrong.";
    authMessage.classList.add("error");
  } finally {
    authSubmitBtn.disabled = false;
  }
});

async function refreshAuthState() {
  if (!window.supabaseClient) {
    updateAuthButtons();
    return;
  }
  try {
    const { data } = await window.supabaseClient.auth.getUser();
    currentUser = data?.user || null;
  } catch {
    currentUser = null;
  }
  updateAuthButtons();
}

// INITIAL SETUP
renderTripHistory();
loadSharedTripFromUrl();
refreshAuthState();