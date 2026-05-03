// auth.js — Auth with roles: superadmin | admin | user

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
    this.db = db;
    this._user = null;
  }

  async init() {
    this._ensureSuperAdmin();
    this._user = this.db.getUser();
    if (this._user) {
      const acc = this._getAccount(this._user.uid);
      if (acc) this._user = { ...this._user, role: acc.role, active: acc.active };
    }
  }

  _ensureSuperAdmin() {
    const accounts = this.db._localGet('fp_accounts', []);
    if (!accounts.find(a => a.uid === SUPER_ADMIN.uid)) {
      accounts.unshift({ ...SUPER_ADMIN });
      localStorage.setItem('fp_accounts', JSON.stringify(accounts));
    }
  }

  isAuthenticated() { return !!this._user; }
  currentUser()     { return this._user; }
  isSuperAdmin(u = this._user) { return u?.role === 'superadmin'; }
  isAdmin(u = this._user)      { return u?.role === 'admin' || u?.role === 'superadmin'; }

  can(action, u = this._user) {
    const role = u?.role || 'user';
    const perms = {
      superadmin: ['view_dashboard','log_activity','view_history','manage_questionnaire',
                   'manage_settings','manage_users','assign_roles','delete_any_activity'],
      admin:      ['view_dashboard','log_activity','view_history','manage_questionnaire','manage_settings'],
      user:       ['view_dashboard','log_activity','view_history'],
    };
    return (perms[role] || perms.user).includes(action);
  }

  async login(email, password) {
    if (!email || !password) throw new Error('Email and password required');
    if (this.db.isOnline) {
      try {
        const { getAuth, signInWithEmailAndPassword }
          = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const cred = await signInWithEmailAndPassword(getAuth(this.db._app), email, password);
        const role = await this.db.getUserRole(cred.user.uid) || 'user';
        const user = { uid: cred.user.uid, email: cred.user.email,
                       name: cred.user.displayName || email.split('@')[0], role, active: true };
        this._user = user; this.db.saveUser(user); return user;
      } catch (err) {
        if (err.code !== 'auth/configuration-not-found') throw new Error(this._fbErrMsg(err.code));
      }
    }
    const acc = this._getAccountByEmail(email);
    if (!acc || acc.password !== btoa(password)) throw new Error('Invalid email or password');
    if (acc.active === false) throw new Error('Account deactivated. Contact an administrator.');
    const user = { uid: acc.uid, email: acc.email, name: acc.name, role: acc.role || 'user', active: true, team: acc.team || '' };
    this._user = user; this.db.saveUser(user); return user;
  }

  async register(email, password, name) {
    if (!email || !password) throw new Error('Email and password required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    if (this.db.isOnline) {
      try {
        const { getAuth, createUserWithEmailAndPassword, updateProfile }
          = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const cred = await createUserWithEmailAndPassword(getAuth(this.db._app), email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        const user = { uid: cred.user.uid, email, name: name || email.split('@')[0], role: 'user', active: true };
        await this.db.saveUserRole(cred.user.uid, 'user');
        this._user = user; this.db.saveUser(user); return user;
      } catch (err) {
        if (err.code !== 'auth/configuration-not-found') throw new Error(this._fbErrMsg(err.code));
      }
    }
    if (this._getAccountByEmail(email)) throw new Error('Email already registered');
    const uid = 'local_' + Math.random().toString(36).slice(2);
    const accounts = this.db._localGet('fp_accounts', []);
    accounts.push({ uid, email, password: btoa(password), name: name || email.split('@')[0], role: 'user', active: true });
    localStorage.setItem('fp_accounts', JSON.stringify(accounts));
    const user = { uid, email, name: name || email.split('@')[0], role: 'user', active: true };
    this._user = user; this.db.saveUser(user); return user;
  }

  async signOut() {
    if (this.db.isOnline) {
      try {
        const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        await signOut(getAuth(this.db._app));
      } catch (_) {}
    }
    this._user = null; this.db.clearUser();
  }

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
    if (this._user?.uid === uid) { this._user = { ...this._user, ...changes }; this.db.saveUser(this._user); }
  }

  deleteAccount(uid) {
    if (uid === 'superadmin')   throw new Error('Cannot delete the Super Admin account');
    if (uid === this._user?.uid) throw new Error('Cannot delete your own account');
    const accounts = this.db._localGet('fp_accounts', []).filter(a => a.uid !== uid);
    localStorage.setItem('fp_accounts', JSON.stringify(accounts));
  }

  updateProfile(p) {
    if (!this._user) return;
    this._user = { ...this._user, ...p };
    this.db.saveUser(this._user);
    try { this.updateAccount(this._user.uid, p); } catch(_) {}
  }

  _getAccount(uid)         { return this.db._localGet('fp_accounts', []).find(a => a.uid === uid); }
  _getAccountByEmail(email){ return this.db._localGet('fp_accounts', []).find(a => a.email === email); }

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
