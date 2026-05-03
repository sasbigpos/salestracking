// db.js — Database abstraction (LocalStorage + Firestore)

const KEYS = {
  activities: 'fp_activities',
  questions:  'fp_questions',
  config:     'fp_firebase_config',
  profile:    'fp_profile',
  user:       'fp_user',
};

export class DB {
  constructor() {
    this._firestore = null;
    this._app = null;
    this._fs  = null;
  }

  async init() {
    const cfg = this.getLocalConfig();
    if (cfg?.apiKey) {
      try { await this.connectFirestore(cfg); } catch (_) {}
    }
  }

  // ── Firestore Connection ──────────────────────
  async connectFirestore(config) {
    const { initializeApp, getApps }
      = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getFirestore, collection, addDoc, getDocs, deleteDoc, query,
            where, orderBy, doc, setDoc, getDoc, updateDoc }
      = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const existing = getApps().find(a => a.name === 'fieldpulse');
    this._app       = existing || initializeApp(config, 'fieldpulse');
    this._firestore = getFirestore(this._app);
    this._fs        = { collection, addDoc, getDocs, deleteDoc, query, where, orderBy, doc, setDoc, getDoc, updateDoc };
    const testQ = query(collection(this._firestore, 'activities'), where('_test','==',true));
    await getDocs(testQ);
    console.log('[DB] Firestore connected');
  }

  get isOnline() { return !!this._firestore; }

  // ── Activities ────────────────────────────────
  async addActivity(activity) {
    activity.id = activity.id || `local_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    if (this.isOnline) {
      const ref = await this._fs.addDoc(this._fs.collection(this._firestore, 'activities'), activity);
      activity.firestoreId = ref.id;
    }
    const all = this._localGet(KEYS.activities);
    all.push(activity);
    this._localSet(KEYS.activities, all);
    return activity;
  }

  async getActivities(userId = null) {
    if (this.isOnline) {
      try {
        const { collection, getDocs, orderBy, query } = this._fs;
        const col = collection(this._firestore, 'activities');
        const q   = query(col, orderBy('timestamp', 'desc'));
        const snap = await getDocs(q);
        const remote = snap.docs.map(d => ({ ...d.data(), firestoreId: d.id }));
        const fids = new Set(remote.map(a => a.firestoreId));
        const local = this._localGet(KEYS.activities).filter(a => !a.firestoreId || !fids.has(a.firestoreId));
        let all = [...remote, ...local].sort((a,b) => b.timestamp - a.timestamp);
        if (userId) all = all.filter(a => a.userId === userId);
        return all;
      } catch (_) {}
    }
    let all = [...this._localGet(KEYS.activities)].sort((a,b) => b.timestamp - a.timestamp);
    if (userId) all = all.filter(a => a.userId === userId);
    return all;
  }

  async deleteActivity(id) {
    const all  = this._localGet(KEYS.activities);
    const item = all.find(a => a.id === id);
    this._localSet(KEYS.activities, all.filter(a => a.id !== id));
    if (this.isOnline && item?.firestoreId) {
      const { doc, deleteDoc } = this._fs;
      await deleteDoc(doc(this._firestore, 'activities', item.firestoreId));
    }
  }

  async clearActivities() {
    this._localSet(KEYS.activities, []);
    if (this.isOnline) {
      const { collection, getDocs, deleteDoc, doc } = this._fs;
      const snap = await getDocs(collection(this._firestore, 'activities'));
      await Promise.all(snap.docs.map(d => deleteDoc(doc(this._firestore, 'activities', d.id))));
    }
  }

  // ── User roles (Firestore) ─────────────────────
  async getUserRole(uid) {
    if (!this.isOnline) return null;
    try {
      const { doc, getDoc } = this._fs;
      const snap = await getDoc(doc(this._firestore, 'userRoles', uid));
      return snap.exists() ? snap.data().role : null;
    } catch { return null; }
  }

  async saveUserRole(uid, role) {
    if (!this.isOnline) return;
    const { doc, setDoc } = this._fs;
    await setDoc(doc(this._firestore, 'userRoles', uid), { role, updatedAt: Date.now() });
  }

  // ── Questions ─────────────────────────────────
  getQuestions() { return this._localGet(KEYS.questions); }
  saveQuestions(questions) {
    this._localSet(KEYS.questions, questions);
    if (this.isOnline) {
      const { doc, setDoc } = this._fs;
      setDoc(doc(this._firestore, 'config', 'questions'), { questions }).catch(() => {});
    }
  }

  // ── Config / Profile ──────────────────────────
  getLocalConfig()      { return this._localGet(KEYS.config, null); }
  saveLocalConfig(cfg)  { localStorage.setItem(KEYS.config, JSON.stringify(cfg)); }
  getProfile()          { return this._localGet(KEYS.profile, null); }
  saveProfile(p)        { localStorage.setItem(KEYS.profile, JSON.stringify(p)); }

  // ── Auth data ─────────────────────────────────
  getUser()       { return this._localGet(KEYS.user, null); }
  saveUser(u)     { localStorage.setItem(KEYS.user, JSON.stringify(u)); }
  clearUser()     { localStorage.removeItem(KEYS.user); }

  // ── Helpers ───────────────────────────────────
  _localGet(key, def = []) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def; } catch { return def; }
  }
  _localSet(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
}
