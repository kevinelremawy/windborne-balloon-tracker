let fullHistory = null;

// -------------------------
// 1) SET UP THE MAP
// -------------------------
const map = L.map('map').setView([20, 0], 2); // centered roughly on the world

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// Layer group to hold balloon markers (so we can clear/redraw easily)
const balloonLayer = L.layerGroup().addTo(map);

// -------------------------
// 2) HELPERS
// -------------------------

// Turn the raw array-of-arrays into objects with lat/lon/alt
function parseBalloonPoints(raw) {
  const points = [];

  if (!Array.isArray(raw)) {
    console.warn("Balloon data is not an array:", raw);
    return points;
  }

  for (const entry of raw) {
    // Expect something like [lat, lon, maybeAlt]
    if (!Array.isArray(entry) || entry.length < 2) continue;

    const lat = Number(entry[0]);
    const lon = Number(entry[1]);
    const alt = entry.length >= 3 ? Number(entry[2]) : null;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    points.push({ lat, lon, alt });
  }

  return points;
}

// Draw balloons on the map
function renderBalloons(points) {
  // Remove old markers
  balloonLayer.clearLayers();

  if (!points.length) {
    console.warn("No valid balloon points to render.");
    return;
  }

  points.forEach((p, index) => {
    const marker = L.circleMarker([p.lat, p.lon], {
      radius: 5
      // (no explicit color so Leaflet uses default)
    });

    let popupText = `Balloon #${index + 1}<br>Lat: ${p.lat.toFixed(2)}<br>Lon: ${p.lon.toFixed(2)}`;
    if (p.alt !== null && Number.isFinite(p.alt)) {
      popupText += `<br>Alt (3rd value): ${p.alt.toFixed(2)}`;
    }

    marker.bindPopup(popupText);
    marker.addTo(balloonLayer);
  });

  // Auto-zoom to fit all balloons
  const group = L.featureGroup(balloonLayer.getLayers());
  map.fitBounds(group.getBounds().pad(0.2));
}

// -------------------------
// 3) FETCH 24-HOUR HISTORY
// -------------------------

const API_BASE = 'https://windborne-balloon-tracker.onrender.com/api';

// Fetch one hour of balloon data
async function fetchHour(hour) {
  const url = `${API_BASE}/balloons/${hour}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return parseBalloonPoints(json);
  } catch (err) {
    console.warn("Hour fetch error:", hour, err);
    return null;
  }
}

// Fetch **all 24 hours** (00–23)
async function fetchAllHours() {
  const allHistory = [];

  for (let hour = 0; hour < 24; hour++) {
    const points = await fetchHour(hour);
    if (points && points.length) {
      allHistory.push({ hour, points });
    }
  }

  console.log("Full 24-hour history:", allHistory);
  return allHistory;
}

// -------------------------
// 4) RENDER FLIGHT HISTORY
// -------------------------

function renderFlightHistory(history) {
  balloonLayer.clearLayers();

  // --- 1) Plot the latest hour as markers ---
  const latest = history[0].points; // hour 0
  latest.forEach((p, index) => {
const marker = L.circleMarker([p.lat, p.lon], { radius: 4 });

marker.on("click", async () => {
  const weather = await fetchWeather(p.lat, p.lon);

  let popupText = `
    <b>Balloon Latest Position</b><br>
    Lat: ${p.lat.toFixed(2)}<br>
    Lon: ${p.lon.toFixed(2)}<br><br>
  `;

  if (weather) {
    popupText += `
      <b>Weather Now</b><br>
      Temp: ${weather.temperature_2m} °C<br>
      Wind: ${weather.wind_speed_10m} m/s<br>
      Code: ${weather.weather_code}<br>
    `;
  } else {
    popupText += `<i>Weather unavailable</i>`;
  }

  marker.bindPopup(popupText).openPopup();
});

marker.addTo(balloonLayer);

  });

  // --- 2) Draw lines showing movement from hour to hour ---
  for (let h = 0; h < history.length - 1; h++) {
    const currentHour = history[h].points;
    const nextHour = history[h + 1].points;

    // connect points hour-by-hour
    currentHour.forEach((p, idx) => {
      if (!nextHour[idx]) return;

      const line = L.polyline(
        [
          [p.lat, p.lon],
          [nextHour[idx].lat, nextHour[idx].lon]
        ],
        {
          weight: 1,
          opacity: 0.4
          // no custom color
        }
      );
      line.addTo(balloonLayer);
    });
  }

  // Fit map to all markers
  const group = L.featureGroup(balloonLayer.getLayers());
  map.fitBounds(group.getBounds().pad(0.2));
}


// -------------------------
// 5) AUTO-RUN ON PAGE LOAD
// -------------------------

async function start() {
  fullHistory = await fetchAllHours();
  renderLatest(fullHistory[0].points);
}

// Render latest only
function renderLatest(latestPoints) {
  balloonLayer.clearLayers();

  latestPoints.forEach((p, index) => {
    const marker = L.circleMarker([p.lat, p.lon], { radius: 4 });

    marker.on("click", async () => {
      const weather = await fetchWeather(p.lat, p.lon);

      let popupText = `
        <b>Balloon Latest Position</b><br>
        Lat: ${p.lat.toFixed(2)}<br>
        Lon: ${p.lon.toFixed(2)}<br><br>
      `;

      if (weather) {
        popupText += `
          <b>Weather Now</b><br>
          Temp: ${weather.temperature_2m} °C<br>
          Wind: ${weather.wind_speed_10m} m/s<br>
          Code: ${weather.weather_code}<br>
        `;
      } else {
        popupText += `<i>Weather unavailable</i>`;
      }

      marker.bindPopup(popupText).openPopup();
    });

    marker.addTo(balloonLayer);
  });

  const group = L.featureGroup(balloonLayer.getLayers());
  map.fitBounds(group.getBounds().pad(0.2));
}


// -------------------------
// 6) WEATHER API (Open-Meteo)
// -------------------------
async function fetchWeather(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,wind_speed_10m,weather_code`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.current;
  } catch (err) {
    console.warn("Weather fetch error:", err);
    return null;
  }
}

// Buttons
document.getElementById("latestBtn").addEventListener("click", () => {
  if (!fullHistory) return;
  renderLatest(fullHistory[0].points);
});

document.getElementById("historyBtn").addEventListener("click", () => {
  if (!fullHistory) return;
  renderFlightHistory(fullHistory);
});

start();
