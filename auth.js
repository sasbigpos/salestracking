// auth.js — Auth with roles: superadmin | admin | user
// KEY FIX: Firebase Auth uses IndexedDB for its own session — we must
// (1) set persistence to SESSION so it doesn't survive page reload,
// (2) always await signOut() from Firebase before reloading,
// (3) on init, use onAuthStateChanged to detect the real Firebase state.

const SUPER_ADMIN = {
  uid:      'superadmin',
  email:    'admin@fieldpulse.app',
  password: btoa('Admin@1234'),
  name:     'Super Admin',
  role:     'superadmin',
  team:     'Management',
  active:   true,
};

export class Auth {
  constructor(db) {
    this.db    = db;
    this._user = null;
    this._fbAuth = null;   // holds the Firebase Auth instance once initialised
  }

  // ── Init ────────────────────────────────────────
  async init() {
    this._ensureSuperAdmin();

    // If we just signed out (URL has ?signout=), do not restore any session
    if (window.location.search.includes('signout=')) {
      this._user = null;
      // Clean the URL without reload
      const clean = window.location.pathname;
      window.history.replaceState({}, '', clean);
      return;
    }

    // If Firebase is configured, let Firebase Auth be the source of truth.
    if (this.db.isOnline && this.db._app) {
      await this._initFirebaseAuth();
      return;
    }

    // Local-only mode — validate the stored session
    this._loadLocalSession();
  }

  // Initialise Firebase Auth with SESSION persistence so it won't
  // silently restore a session after a page reload following sign-out.
  async _initFirebaseAuth() {
    try {
      const { getAuth, setPersistence, browserSessionPersistence, onAuthStateChanged }
        = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');

      this._fbAuth = getAuth(this.db._app);

      // SESSION persistence: the Firebase session lives only for this browser tab.
      // After signOut() + reload, Firebase will NOT auto-restore the user.
      await setPersistence(this._fbAuth, browserSessionPersistence);

      // Wait for Firebase to tell us if a user is already logged in
      await new Promise(resolve => {
        const unsub = onAuthStateChanged(this._fbAuth, async fbUser => {
          unsub();   // only need the first emission
          if (fbUser) {
            // Firebase says someone is logged in — sync to our session
            const role = await this.db.getUserRole(fbUser.uid) || 'user';
            this._user = {
              uid:    fbUser.uid,
              email:  fbUser.email,
              name:   fbUser.displayName || fbUser.email.split('@')[0],
              role,
              active: true,
            };
            this.db.saveUser(this._user);
          } else {
            // Firebase says no one is logged in — clear any stale local copy
            this._user = null;
            localStorage.removeItem('fp_user');
          }
          resolve();
        });
      });
    } catch (err) {
      console.warn('[Auth] Firebase Auth init failed, falling back to local:', err.message);
      this._loadLocalSession();
    }
  }

  _loadLocalSession() {
    const stored = this.db.getUser();
    if (!stored) { this._user = null; return; }
    const acc = this._getAccount(stored.uid);
    if (acc && acc.active !== false) {
      this._user = { ...stored, role: acc.role, active: acc.active };
    } else {
      // Stale or deactivated — wipe it
      localStorage.removeItem('fp_user');
      this._user = null;
    }
  }

  _ensureSuperAdmin() {
    const accounts = this.db._localGet('fp_accounts', []);
    if (!accounts.find(a => a.uid === SUPER_ADMIN.uid)) {
      accounts.unshift({ ...SUPER_ADMIN });
      localStorage.setItem('fp_accounts', JSON.stringify(accounts));
    }
  }

  // ── Getters ─────────────────────────────────────
  isAuthenticated()            { return !!this._user; }
  currentUser()                { return this._user; }
  isSuperAdmin(u = this._user) { return u?.role === 'superadmin'; }
  isAdmin(u = this._user)      { return u?.role === 'admin' || u?.role === 'superadmin'; }

  can(action, u = this._user) {
    const role  = u?.role || 'user';
    const perms = {
      superadmin: ['view_dashboard','log_activity','view_history','manage_questionnaire',
                   'manage_settings','manage_users','assign_roles','delete_any_activity'],
      admin:      ['view_dashboard','log_activity','view_history','manage_questionnaire','manage_settings'],
      user:       ['view_dashboard','log_activity','view_history'],
    };
    return (perms[role] || perms.user).includes(action);
  }

  // ── Login ────────────────────────────────────────
  async login(email, password) {
    if (!email || !password) throw new Error('Email and password required');

    if (this.db.isOnline && this.db._app) {
      try {
        const { getAuth, signInWithEmailAndPassword, setPersistence, browserSessionPersistence }
          = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const fbAuth = getAuth(this.db._app);
        this._fbAuth = fbAuth;
        await setPersistence(fbAuth, browserSessionPersistence);
        const cred = await signInWithEmailAndPassword(fbAuth, email, password);
        const role = await this.db.getUserRole(cred.user.uid) || 'user';
        const user = {
          uid:    cred.user.uid,
          email:  cred.user.email,
          name:   cred.user.displayName || email.split('@')[0],
          role,
          active: true,
        };
        this._user = user;
        this.db.saveUser(user);
        return user;
      } catch (err) {
        if (err.code && err.code !== 'auth/configuration-not-found')
          throw new Error(this._fbErrMsg(err.code));
      }
    }

    // Local demo mode
    const acc = this._getAccountByEmail(email);
    if (!acc || acc.password !== btoa(password)) throw new Error('Invalid email or password');
    if (acc.active === false) throw new Error('Account deactivated. Contact an administrator.');
    const user = { uid: acc.uid, email: acc.email, name: acc.name, role: acc.role || 'user', active: true, team: acc.team || '' };
    this._user = user;
    this.db.saveUser(user);
    return user;
  }

  // ── Register ─────────────────────────────────────
  async register(email, password, name) {
    if (!email || !password) throw new Error('Email and password required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');

    if (this.db.isOnline && this.db._app) {
      try {
        const { getAuth, createUserWithEmailAndPassword, updateProfile, setPersistence, browserSessionPersistence }
          = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const fbAuth = getAuth(this.db._app);
        this._fbAuth = fbAuth;
        await setPersistence(fbAuth, browserSessionPersistence);
        const cred = await createUserWithEmailAndPassword(fbAuth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        const user = { uid: cred.user.uid, email, name: name || email.split('@')[0], role: 'user', active: true };
        await this.db.saveUserRole(cred.user.uid, 'user');
        this._user = user;
        this.db.saveUser(user);
        return user;
      } catch (err) {
        if (err.code && err.code !== 'auth/configuration-not-found')
          throw new Error(this._fbErrMsg(err.code));
      }
    }

    // Local demo mode
    if (this._getAccountByEmail(email)) throw new Error('Email already registered');
    const uid = 'local_' + Math.random().toString(36).slice(2);
    const accounts = this.db._localGet('fp_accounts', []);
    accounts.push({ uid, email, password: btoa(password), name: name || email.split('@')[0], role: 'user', active: true });
    localStorage.setItem('fp_accounts', JSON.stringify(accounts));
    const user = { uid, email, name: name || email.split('@')[0], role: 'user', active: true };
    this._user = user;
    this.db.saveUser(user);
    return user;
  }

  // ── Sign Out ─────────────────────────────────────
  // This is the critical path. We MUST await Firebase signOut before
  // reloading — otherwise Firebase's IndexedDB session survives.
  async signOut() {
    // 1. Sign out from Firebase Auth (clears IndexedDB session)
    if (this._fbAuth) {
      try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        await signOut(this._fbAuth);
      } catch (err) {
        console.warn('[Auth] Firebase signOut error:', err.message);
      }
    } else if (this.db.isOnline && this.db._app) {
      // _fbAuth might not be set if init ran before Firebase was ready
      try {
        const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        await signOut(getAuth(this.db._app));
      } catch (_) {}
    }

    // 2. Clear ALL local session data
    this._user   = null;
    this._fbAuth = null;
    const keysToRemove = ['fp_user', 'fp_profile'];
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // 3. Clear any Firebase Auth IndexedDB remnants by name
    //    (belt-and-suspenders in case signOut() didn't fully clear)
    try {
      const dbNames = await indexedDB.databases?.() ?? [];
      for (const info of dbNames) {
        if (info.name?.includes('firebase') || info.name?.includes('firebaseLocalStorage')) {
          indexedDB.deleteDatabase(info.name);
        }
      }
    } catch (_) {}
  }

  // ── User Management ──────────────────────────────
  getAllAccounts() {
    return this.db._localGet('fp_accounts', []).map(a => ({
      uid: a.uid, email: a.email, name: a.name, role: a.role || 'user',
      active: a.active !== false, team: a.team || ''
    }));
  }

  updateAccount(uid, changes) {
    if (uid === 'superadmin' && (changes.role !== undefined || changes.active === false))
      throw new Error('Cannot modify the Super Admin account');
    const accounts = this.db._localGet('fp_accounts', []);
    const idx = accounts.findIndex(a => a.uid === uid);
    if (idx === -1) throw new Error('Account not found');
    accounts[idx] = { ...accounts[idx], ...changes };
    localStorage.setItem('fp_accounts', JSON.stringify(accounts));
    if (this._user?.uid === uid) {
      this._user = { ...this._user, ...changes };
      this.db.saveUser(this._user);
    }
  }

  deleteAccount(uid) {
    if (uid === 'superadmin')    throw new Error('Cannot delete the Super Admin account');
    if (uid === this._user?.uid) throw new Error('Cannot delete your own account');
    const accounts = this.db._localGet('fp_accounts', []).filter(a => a.uid !== uid);
    localStorage.setItem('fp_accounts', JSON.stringify(accounts));
  }

  updateProfile(p) {
    if (!this._user) return;
    this._user = { ...this._user, ...p };
    this.db.saveUser(this._user);
    try { this.updateAccount(this._user.uid, p); } catch (_) {}
  }

  // ── Helpers ──────────────────────────────────────
  _getAccount(uid)          { return this.db._localGet('fp_accounts', []).find(a => a.uid === uid); }
  _getAccountByEmail(email) { return this.db._localGet('fp_accounts', []).find(a => a.email === email); }

  _fbErrMsg(code) {
    const map = {
      'auth/user-not-found':       'No account found with this email',
      'auth/wrong-password':       'Incorrect password',
      'auth/invalid-credential':   'Invalid email or password',
      'auth/email-already-in-use': 'Email already registered',
      'auth/invalid-email':        'Invalid email address',
      'auth/weak-password':        'Password too weak (min 6 chars)',
      'auth/too-many-requests':    'Too many attempts. Try again later.',
    };
    return map[code] || 'Authentication error: ' + code;
  }
}
