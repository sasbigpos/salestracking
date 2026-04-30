// ────────────────────────────────────────────────
//  FieldPulse — Sales Activity Tracker
//  app.js  (ES module, no bundler required)
// ────────────────────────────────────────────────

import { DB } from './db.js';
import { GeoService } from './geo.js';
import { MapService } from './maps.js';
import { QuestionnaireManager } from './questionnaire.js';
import { HistoryManager } from './history.js';
import { Auth } from './auth.js';
import { toast, formatDate, formatDateTime, outcomeClass } from './utils.js';

// ── Boot ──────────────────────────────────────────
const db = new DB();
const geo = new GeoService();
const q = new QuestionnaireManager(db);
const history = new HistoryManager(db, q);
const auth = new Auth(db);
let logMap = null, dashMap = null, modalMap = null;

async function boot() {
  // Animate splash
  const splash = document.getElementById('splash');
  await new Promise(r => setTimeout(r, 1800));
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 600);

  // Update date chip
  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-MY', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  await db.init();
  await auth.init();

  // Show app or auth wall
  if (auth.isAuthenticated()) {
    showApp();
  } else {
    document.getElementById('authWall').classList.remove('hidden');
    initAuthForm();
  }
}

function showApp() {
  document.getElementById('authWall').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  updateUserBadge();
  initNavigation();
  initLogForm();
  initQuestionnaire();
  initHistory();
  initSettings();
  initDashboard();
  initMobileSidebar();
}

// ── Navigation ───────────────────────────────────
function initNavigation() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      navigateTo(el.dataset.page);
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  if (page === 'dashboard') refreshDashboard();
  if (page === 'history')   history.render();
  if (page === 'log')       initLogMap();
  if (page === 'questionnaire') q.render();

  // Close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
}

function initMobileSidebar() {
  document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
}

// ── Auth ──────────────────────────────────────────
function initAuthForm() {
  let mode = 'login';
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      mode = tab.dataset.tab;
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
      document.getElementById('regNameGroup').style.display = mode === 'register' ? 'block' : 'none';
      document.getElementById('authSubmitBtn').textContent = mode === 'register' ? 'Create Account' : 'Sign In';
      document.getElementById('authError').classList.add('hidden');
    });
  });

  document.getElementById('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const name = document.getElementById('authName').value.trim();
    const errEl = document.getElementById('authError');
    errEl.classList.add('hidden');
    try {
      if (mode === 'register') await auth.register(email, password, name);
      else await auth.login(email, password);
      showApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await auth.signOut();
    document.getElementById('app').classList.add('hidden');
    document.getElementById('authWall').classList.remove('hidden');
    toast('Signed out');
  });
}

function updateUserBadge() {
  const user = auth.currentUser();
  if (!user) return;
  const name = user.name || user.email || 'User';
  document.getElementById('userName').textContent = name;
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('mobileAvatar').textContent = name.charAt(0).toUpperCase();
}

// ── Dashboard ────────────────────────────────────
async function initDashboard() {
  await refreshDashboard();
}

async function refreshDashboard() {
  const activities = await db.getActivities();
  const today = new Date().toDateString();
  const weekAgo = Date.now() - 7 * 86400000;

  const todayCount = activities.filter(a => new Date(a.timestamp).toDateString() === today).length;
  const weekCount = activities.filter(a => a.timestamp >= weekAgo).length;
  const locations = new Set(activities.filter(a => a.lat).map(a => `${a.lat?.toFixed(3)},${a.lng?.toFixed(3)}`)).size;

  document.getElementById('statToday').textContent = todayCount;
  document.getElementById('statWeek').textContent = weekCount;
  document.getElementById('statTotal').textContent = activities.length;
  document.getElementById('statLocations').textContent = locations;

  // Recent feed
  const feed = document.getElementById('recentFeed');
  const recent = [...activities].sort((a,b) => b.timestamp - a.timestamp).slice(0, 6);
  feed.innerHTML = recent.length ? recent.map(a => `
    <div class="feed-item" data-id="${a.id}">
      <div class="feed-dot"></div>
      <div class="feed-body">
        <div class="feed-client">${esc(a.clientName)}</div>
        <div class="feed-meta">${esc(a.activityType)}${a.outcome ? ' · ' + esc(a.outcome) : ''}</div>
      </div>
      <div class="feed-time">${formatDate(a.timestamp)}</div>
    </div>
  `).join('') : '<div class="empty-state">No activities yet. <a href="#" data-page="log">Log one →</a></div>';

  // Click on feed item
  feed.querySelectorAll('.feed-item').forEach(el => {
    el.addEventListener('click', () => {
      navigateTo('history');
      setTimeout(() => history.openDetail(el.dataset.id), 200);
    });
  });
  feed.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigateTo(el.dataset.page); });
  });

  // Map pin count
  const pinned = activities.filter(a => a.lat).length;
  document.getElementById('mapBadge').textContent = `${pinned} pin${pinned !== 1 ? 's' : ''}`;

  // Dash map
  await MapService.loadLeaflet();
  if (!dashMap) {
    dashMap = MapService.createMap('dashMap');
  }
  MapService.clearMarkers(dashMap);
  activities.filter(a => a.lat).forEach(a => {
    MapService.addMarker(dashMap, a.lat, a.lng, `<strong>${esc(a.clientName)}</strong><br>${esc(a.activityType)}`);
  });
  if (activities.some(a => a.lat)) MapService.fitMarkers(dashMap);
}

// ── Log Activity ─────────────────────────────────
let currentGeo = null;

function initLogForm() {
  acquireLocation();
  document.getElementById('geoRefresh').addEventListener('click', acquireLocation);

  document.getElementById('logForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.textContent = 'Saving…';
    try {
      const answers = q.collectAnswers();
      const activity = {
        clientName: document.getElementById('clientName').value.trim(),
        activityType: document.getElementById('activityType').value,
        outcome: document.getElementById('outcome').value,
        notes: document.getElementById('notes').value.trim(),
        lat: currentGeo?.lat ?? null,
        lng: currentGeo?.lng ?? null,
        accuracy: currentGeo?.accuracy ?? null,
        timestamp: Date.now(),
        userId: auth.currentUser()?.uid || 'local',
        customAnswers: answers,
      };
      if (!activity.clientName || !activity.activityType) {
        toast('Please fill in required fields', 'error'); return;
      }
      await db.addActivity(activity);
      toast('✅ Activity saved!');
      document.getElementById('logForm').reset();
      q.renderDynamicFields();
    } catch (err) {
      toast('Error saving: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg> Save Activity';
    }
  });

  document.getElementById('clearFormBtn').addEventListener('click', () => {
    document.getElementById('logForm').reset();
    q.renderDynamicFields();
  });
}

async function initLogMap() {
  await MapService.loadLeaflet();
  if (!logMap) {
    logMap = MapService.createMap('logMap');
  }
  if (currentGeo) {
    MapService.setView(logMap, currentGeo.lat, currentGeo.lng, 15);
    MapService.addMarker(logMap, currentGeo.lat, currentGeo.lng, 'Your location');
  }
}

async function acquireLocation() {
  const strip = document.getElementById('geoStrip');
  const status = document.getElementById('geoStatus');
  const coords = document.getElementById('geoCoords');
  strip.className = 'geo-strip';
  status.textContent = 'Acquiring location…';
  coords.textContent = '—';
  try {
    const pos = await geo.getCurrentPosition();
    currentGeo = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    status.textContent = 'Location acquired';
    coords.textContent = `${currentGeo.lat.toFixed(5)}, ${currentGeo.lng.toFixed(5)} (±${Math.round(currentGeo.accuracy)}m)`;
    strip.classList.add('ok');
    if (logMap) {
      MapService.clearMarkers(logMap);
      MapService.setView(logMap, currentGeo.lat, currentGeo.lng, 15);
      MapService.addMarker(logMap, currentGeo.lat, currentGeo.lng, 'Your location');
    }
  } catch (err) {
    status.textContent = 'Location unavailable';
    coords.textContent = err.message;
    strip.classList.add('error');
    currentGeo = null;
  }
}

// ── Questionnaire ─────────────────────────────────
function initQuestionnaire() {
  q.init();
  document.getElementById('addQuestionBtn').addEventListener('click', () => q.openModal());
}

// ── History ───────────────────────────────────────
function initHistory() {
  history.init();
}

// ── Settings ─────────────────────────────────────
function initSettings() {
  // Load saved config
  const cfg = db.getLocalConfig();
  if (cfg) {
    document.getElementById('fbApiKey').value = cfg.apiKey || '';
    document.getElementById('fbAuthDomain').value = cfg.authDomain || '';
    document.getElementById('fbProjectId').value = cfg.projectId || '';
    document.getElementById('fbStorageBucket').value = cfg.storageBucket || '';
    document.getElementById('fbMessagingSenderId').value = cfg.messagingSenderId || '';
    document.getElementById('fbAppId').value = cfg.appId || '';
  }
  const profile = db.getProfile();
  if (profile) {
    document.getElementById('profileName').value = profile.name || '';
    document.getElementById('profileTeam').value = profile.team || '';
  }

  document.getElementById('firebaseForm').addEventListener('submit', async e => {
    e.preventDefault();
    const config = {
      apiKey: document.getElementById('fbApiKey').value.trim(),
      authDomain: document.getElementById('fbAuthDomain').value.trim(),
      projectId: document.getElementById('fbProjectId').value.trim(),
      storageBucket: document.getElementById('fbStorageBucket').value.trim(),
      messagingSenderId: document.getElementById('fbMessagingSenderId').value.trim(),
      appId: document.getElementById('fbAppId').value.trim(),
    };
    const status = document.getElementById('fbStatus');
    try {
      await db.connectFirestore(config);
      db.saveLocalConfig(config);
      status.textContent = '✓ Connected to Firestore';
      status.className = 'status-chip ok';
      status.classList.remove('hidden');
      toast('Firebase connected!');
    } catch (err) {
      status.textContent = '✗ ' + err.message;
      status.className = 'status-chip error';
      status.classList.remove('hidden');
      toast('Connection failed', 'error');
    }
  });

  document.getElementById('profileForm').addEventListener('submit', e => {
    e.preventDefault();
    const profile = {
      name: document.getElementById('profileName').value.trim(),
      team: document.getElementById('profileTeam').value.trim(),
    };
    db.saveProfile(profile);
    auth.updateProfile(profile);
    updateUserBadge();
    toast('Profile updated');
  });

  document.getElementById('exportBtn').addEventListener('click', async () => {
    const activities = await db.getActivities();
    exportCSV(activities);
  });

  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (!confirm('Delete ALL activities? This cannot be undone.')) return;
    await db.clearActivities();
    toast('All data cleared');
    refreshDashboard();
  });
}

function exportCSV(activities) {
  if (!activities.length) { toast('No data to export', 'error'); return; }
  const headers = ['Date', 'Client', 'Type', 'Outcome', 'Latitude', 'Longitude', 'Notes'];
  const rows = activities.map(a => [
    formatDateTime(a.timestamp), a.clientName, a.activityType, a.outcome,
    a.lat ?? '', a.lng ?? '', (a.notes || '').replace(/\n/g, ' ')
  ]);
  const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `fieldpulse-export-${Date.now()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

boot();
