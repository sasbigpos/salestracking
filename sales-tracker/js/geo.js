// geo.js — Geolocation service

export class GeoService {
  getCurrentPosition(options = {}) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported by this browser'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, err => {
        const msgs = {
          1: 'Location permission denied. Please allow in browser settings.',
          2: 'Position unavailable. Check GPS/network.',
          3: 'Location request timed out.',
        };
        reject(new Error(msgs[err.code] || 'Unknown geolocation error'));
      }, {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
        ...options
      });
    });
  }

  watchPosition(callback, errorCallback) {
    if (!navigator.geolocation) return null;
    return navigator.geolocation.watchPosition(callback, errorCallback, {
      enableHighAccuracy: true, maximumAge: 15000
    });
  }

  clearWatch(id) {
    if (id) navigator.geolocation.clearWatch(id);
  }

  // Haversine distance in km
  distance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
