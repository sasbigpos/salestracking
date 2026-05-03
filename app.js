// ────────────────────────────────────────────────
//  FieldPulse — app.js  (role-aware)
// ────────────────────────────────────────────────

import { DB }                   from './db.js';
import { GeoService }           from './geo.js';
import { MapService }           from './maps.js';
import { QuestionnaireManager } from './questionnaire.js';
import { HistoryManager }       from './history.js';
import { Auth }                 from './auth.js';
import { UserManager }          from './usermgmt.js';
import { toast, formatDate, formatDateTime } from './utils.js';

const db      = new DB();
const geo     = new GeoService();
const auth    = new Auth(db);
const q       = new QuestionnaireManager(db);
const history = new HistoryManager(db, q);
const userMgr = new UserManager(auth, db);
let logMap = null, dashMap = null;

// ── Boot ─────────────────────────────────────────
async function boot() {
  const splash = document.getElementById('splash');
  await new Promise(r => setTimeout(r, 1800));
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 600);

  document.getElementById('todayDate').textContent = new Date().toLocaleDateString('en-MY', {
    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
  });

  await db.init();
  await auth.init();

  if (auth.isAuthenticated()) {
    showApp();
  } else {
    document.getElementById('authWall').classList.remove('hidden');
    initAuthForm();
  }
}

// ── Show App ──────────────────────────────────────
function showApp() {
  document.getElementById('authWall').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  applyRoleUI();
  updateUserBadge();
  initNavigation();
  initLogForm();
  initQuestionnaire();
  initHistory();
  initSettings();
  initUserManagement();
  initDashboard();
  initMobileSidebar();
}

// ── Role-based UI gating ──────────────────────────
function applyRoleUI() {
  const user = auth.currentUser();
  const isAdmin = auth.isAdmin();
  const isSuperAdmin = auth.isSuperAdmin();

  // Show/hide nav items
  document.getElementById('navUsers').classList.toggle('hidden', !isAdmin);
  document.getElementById('navSettings').classList.toggle('hidden', !isAdmin);

  // Super admin info banner only for superadmin
  const banner = document.getElementById('superAdminBanner');
  if (banner) banner.classList.toggle('hidden', !isSuperAdmin);

  // Hide "Super Admin" option in add-user form for non-superadmins
  const saOpt = document.getElementById('newUserSuperAdminOption');
  if (saOpt) saOpt.style.display = isSuperAdmin ? '' : 'none';

  // Questionnaire — allow admin+ only to add/edit questions
  const addQBtn = document.getElementById('addQuestionBtn');
  if (addQBtn) addQBtn.classList.toggle('hidden', !isAdmin);
}

// ── Navigation ────────────────────────────────────
function initNavigation() {
  document.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      const page = el.dataset.page;
      // Guard: non-admins cannot access settings or users pages
      if ((page === 'settings' || page === 'users') && !auth.isAdmin()) {
        toast('Access denied — admin only', 'error');
        return;
      }
      navigateTo(page);
    });
  });
}

function navigateTo(page) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');

  if (page === 'dashboard')     refreshDashboard();
  if (page === 'history')       history.render();
  if (page === 'log')           initLogMap();
  if (page === 'questionnaire') q.render();
  if (page === 'users')         userMgr.render();

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
      document.getElementById('authSubmitBtn').textContent  = mode === 'register' ? 'Create Account' : 'Sign In';
      document.getElementById('authError').classList.add('hidden');
    });
  });

  document.getElementById('authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const name     = document.getElementById('authName').value.trim();
    const errEl    = document.getElementById('authError');
    errEl.classList.add('hidden');
    const btn = document.getElementById('authSubmitBtn');
    btn.disabled = true;
    try {
      if (mode === 'register') await auth.register(email, password, name);
      else                     await auth.login(email, password);
      showApp();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById('signOutBtn').addEventListener('click', async () => {
    await auth.signOut();
    // Hard reload — cleanest way to fully reset all in-memory state,
    // map instances, module-level vars, and re-run the auth wall fresh.
    window.location.reload();
  });
}

function updateUserBadge() {
  const user = auth.currentUser();
  if (!user) return;
  const name = user.name || user.email || 'User';
  const roleLabels = { superadmin: '⭐ Super Admin', admin: '🔑 Admin', user: 'Sales Rep' };
  document.getElementById('userName').textContent      = name;
  document.getElementById('userRoleLabel').textContent = roleLabels[user.role] || 'Sales Rep';
  document.getElementById('userAvatar').textContent    = name.charAt(0).toUpperCase();
  document.getElementById('mobileAvatar').textContent  = name.charAt(0).toUpperCase();

  // Colour avatar by role
  const avatarColors = {
    superadmin: 'linear-gradient(135deg,#f5a623,#ff6b35)',
    admin:      'linear-gradient(135deg,#4f8ef7,#7b5ea7)',
    user:       'linear-gradient(135deg,#3ecf8e,#1ea87e)',
  };
  const av = document.getElementById('userAvatar');
  av.style.background = avatarColors[user.role] || avatarColors.user;
}

// ── Dashboard ─────────────────────────────────────
async function initDashboard() { await refreshDashboard(); }

async function refreshDashboard() {
  const user        = auth.currentUser();
  // Admins see all; normal users see only their own
  const activities  = auth.isAdmin()
    ? await db.getActivities()
    : await db.getActivities(user?.uid);

  const today   = new Date().toDateString();
  const weekAgo = Date.now() - 7 * 86400000;

  document.getElementById('statToday').textContent     = activities.filter(a => new Date(a.timestamp).toDateString() === today).length;
  document.getElementById('statWeek').textContent      = activities.filter(a => a.timestamp >= weekAgo).length;
  document.getElementById('statTotal').textContent     = activities.length;
  document.getElementById('statLocations').textContent = new Set(activities.filter(a => a.lat).map(a => `${a.lat?.toFixed(3)},${a.lng?.toFixed(3)}`)).size;

  const feed   = document.getElementById('recentFeed');
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

  feed.querySelectorAll('.feed-item').forEach(el => {
    el.addEventListener('click', () => { navigateTo('history'); setTimeout(() => history.openDetail(el.dataset.id), 200); });
  });
  feed.querySelectorAll('[data-page]').forEach(el => {
    el.addEventListener('click', e => { e.preventDefault(); navigateTo(el.dataset.page); });
  });

  const pinned = activities.filter(a => a.lat).length;
  document.getElementById('mapBadge').textContent = `${pinned} pin${pinned !== 1 ? 's' : ''}`;

  await MapService.loadLeaflet();
  if (!dashMap) dashMap = MapService.createMap('dashMap');
  MapService.clearMarkers(dashMap);
  activities.filter(a => a.lat).forEach(a => {
    MapService.addMarker(dashMap, a.lat, a.lng, `<strong>${esc(a.clientName)}</strong><br>${esc(a.activityType)}`);
  });
  if (activities.some(a => a.lat)) MapService.fitMarkers(dashMap);
}

// ── Log Activity ──────────────────────────────────
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
      const activity = {
        clientName:   document.getElementById('clientName').value.trim(),
        activityType: document.getElementById('activityType').value,
        outcome:      document.getElementById('outcome').value,
        notes:        document.getElementById('notes').value.trim(),
        lat:          currentGeo?.lat   ?? null,
        lng:          currentGeo?.lng   ?? null,
        accuracy:     currentGeo?.accuracy ?? null,
        timestamp:    Date.now(),
        userId:       auth.currentUser()?.uid  || 'local',
        userName:     auth.currentUser()?.name || 'Unknown',
        customAnswers: q.collectAnswers(),
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
  if (!logMap) logMap = MapService.createMap('logMap');
  if (currentGeo) {
    MapService.setView(logMap, currentGeo.lat, currentGeo.lng, 15);
    MapService.addMarker(logMap, currentGeo.lat, currentGeo.lng, 'Your location');
  }
}

async function acquireLocation() {
  const strip  = document.getElementById('geoStrip');
  const status = document.getElementById('geoStatus');
  const coords = document.getElementById('geoCoords');
  strip.className = 'geo-strip';
  status.textContent = 'Acquiring location…';
  coords.textContent = '—';
  try {
    const pos  = await geo.getCurrentPosition();
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
  document.getElementById('addQuestionBtn').addEventListener('click', () => {
    if (!auth.isAdmin()) { toast('Admin access required', 'error'); return; }
    q.openModal();
  });
}

// ── History ───────────────────────────────────────
function initHistory() { history.init(auth); }

// ── User Management ───────────────────────────────
function initUserManagement() {
  if (!auth.isAdmin()) return;
  userMgr.bindModal();

  // Add user panel toggle
  const addBtn    = document.getElementById('addUserToggleBtn');
  const panel     = document.getElementById('addUserPanel');
  const cancelBtn = document.getElementById('cancelAddUserBtn');

  addBtn?.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    addBtn.textContent = panel.classList.contains('hidden') ? '+ Add User' : '✕ Cancel';
  });
  cancelBtn?.addEventListener('click', () => {
    panel.classList.add('hidden');
    addBtn.innerHTML = '<svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add User';
  });

  // Add user form submit wired inside usermgmt.js via bindModal()
}

// ── Settings ──────────────────────────────────────
function initSettings() {
  if (!auth.isAdmin()) return;

  const cfg = db.getLocalConfig();
  if (cfg) {
    document.getElementById('fbApiKey').value          = cfg.apiKey          || '';
    document.getElementById('fbAuthDomain').value      = cfg.authDomain      || '';
    document.getElementById('fbProjectId').value       = cfg.projectId       || '';
    document.getElementById('fbStorageBucket').value   = cfg.storageBucket   || '';
    document.getElementById('fbMessagingSenderId').value = cfg.messagingSenderId || '';
    document.getElementById('fbAppId').value           = cfg.appId           || '';
  }

  const profile = db.getProfile();
  if (profile) {
    document.getElementById('profileName').value = profile.name || '';
    document.getElementById('profileTeam').value = profile.team || '';
  }

  // Pre-fill profile from current user too
  const user = auth.currentUser();
  if (user) {
    if (!document.getElementById('profileName').value) document.getElementById('profileName').value = user.name || '';
    if (!document.getElementById('profileTeam').value) document.getElementById('profileTeam').value = user.team || '';
  }

  document.getElementById('firebaseForm').addEventListener('submit', async e => {
    e.preventDefault();
    if (!auth.isSuperAdmin()) { toast('Super Admin only', 'error'); return; }
    const config = {
      apiKey:            document.getElementById('fbApiKey').value.trim(),
      authDomain:        document.getElementById('fbAuthDomain').value.trim(),
      projectId:         document.getElementById('fbProjectId').value.trim(),
      storageBucket:     document.getElementById('fbStorageBucket').value.trim(),
      messagingSenderId: document.getElementById('fbMessagingSenderId').value.trim(),
      appId:             document.getElementById('fbAppId').value.trim(),
    };
    const statusEl = document.getElementById('fbStatus');
    try {
      await db.connectFirestore(config);
      db.saveLocalConfig(config);
      statusEl.textContent = '✓ Connected to Firestore';
      statusEl.className   = 'status-chip ok';
      statusEl.classList.remove('hidden');
      toast('Firebase connected!');
    } catch (err) {
      statusEl.textContent = '✗ ' + err.message;
      statusEl.className   = 'status-chip error';
      statusEl.classList.remove('hidden');
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
    const activities = auth.isAdmin() ? await db.getActivities() : await db.getActivities(auth.currentUser()?.uid);
    exportCSV(activities);
  });

  document.getElementById('clearDataBtn').addEventListener('click', async () => {
    if (!auth.isSuperAdmin()) { toast('Super Admin only', 'error'); return; }
    if (!confirm('Delete ALL activities? This cannot be undone.')) return;
    await db.clearActivities();
    toast('All data cleared');
    refreshDashboard();
  });
}

// ── CSV Export ────────────────────────────────────
function exportCSV(activities) {
  if (!activities.length) { toast('No data to export', 'error'); return; }
  const headers = ['Date','Client','Type','Outcome','Rep','Latitude','Longitude','Notes'];
  const rows = activities.map(a => [
    formatDateTime(a.timestamp), a.clientName, a.activityType, a.outcome,
    a.userName || '', a.lat ?? '', a.lng ?? '', (a.notes || '').replace(/\n/g,' ')
  ]);
  const csv  = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `fieldpulse-export-${Date.now()}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

boot();
