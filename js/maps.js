// maps.js — Leaflet map helpers

let leafletLoaded = false;
const markers = new WeakMap();

export const MapService = {
  async loadLeaflet() {
    if (leafletLoaded || window.L) { leafletLoaded = true; return; }
    await Promise.all([
      loadCSS('https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'),
      loadScript('https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'),
    ]);
    leafletLoaded = true;
  },

  createMap(elementId, lat = 3.139, lng = 101.686, zoom = 11) {
    const el = document.getElementById(elementId);
    if (!el) return null;
    // Destroy existing
    if (el._leaflet_id) {
      try { el._map?.remove(); } catch (_) {}
    }
    const map = L.map(elementId, { zoomControl: true, attributionControl: true }).setView([lat, lng], zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);
    el._map = map;
    markers.set(map, []);
    return map;
  },

  addMarker(map, lat, lng, popupHtml = '') {
    if (!map || !L) return null;
    const icon = L.divIcon({
      className: '',
      html: `<div style="width:14px;height:14px;background:var(--accent,#f5a623);border:2px solid #fff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,.5)"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const m = L.marker([lat, lng], { icon }).addTo(map);
    if (popupHtml) m.bindPopup(popupHtml);
    const list = markers.get(map) || [];
    list.push(m);
    markers.set(map, list);
    return m;
  },

  clearMarkers(map) {
    if (!map) return;
    const list = markers.get(map) || [];
    list.forEach(m => { try { m.remove(); } catch (_) {} });
    markers.set(map, []);
  },

  setView(map, lat, lng, zoom = 15) {
    if (map) map.setView([lat, lng], zoom);
  },

  fitMarkers(map) {
    const list = markers.get(map) || [];
    if (!list.length || !map) return;
    const group = L.featureGroup(list);
    map.fitBounds(group.getBounds().pad(0.2));
  },

  invalidate(map) {
    if (map) setTimeout(() => map.invalidateSize(), 100);
  }
};

function loadCSS(href) {
  return new Promise(resolve => {
    if (document.querySelector(`link[href="${href}"]`)) { resolve(); return; }
    const el = document.createElement('link');
    el.rel = 'stylesheet'; el.href = href;
    el.onload = resolve; el.onerror = resolve;
    document.head.appendChild(el);
  });
}

function loadScript(src) {
  return new Promise(resolve => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve; el.onerror = resolve;
    document.head.appendChild(el);
  });
}
