// auth.js — Simple auth (local demo + Firebase Auth optional)

export class Auth {
  constructor(db) {
    this.db = db;
    this._user = null;
  }

  async init() {
    this._user = this.db.getUser();
  }

  isAuthenticated() { return !!this._user; }
  currentUser() { return this._user; }

  async login(email, password) {
    if (!email || !password) throw new Error('Email and password required');
    // Try Firebase Auth if available
    if (this.db.isOnline) {
      try {
        const { getAuth, signInWithEmailAndPassword } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const fbAuth = getAuth(this.db._app);
        const cred = await signInWithEmailAndPassword(fbAuth, email, password);
        const user = { uid: cred.user.uid, email: cred.user.email, name: cred.user.displayName || email.split('@')[0] };
        this._user = user;
        this.db.saveUser(user);
        return user;
      } catch (err) {
        if (err.code !== 'auth/configuration-not-found') throw new Error(this._fbErrMsg(err.code));
      }
    }
    // Demo mode — local auth
    const stored = this.db._localGet('fp_accounts', []);
    const acc = stored.find(a => a.email === email && a.password === btoa(password));
    if (!acc) throw new Error('Invalid email or password');
    const user = { uid: acc.uid, email: acc.email, name: acc.name || email.split('@')[0] };
    this._user = user;
    this.db.saveUser(user);
    return user;
  }

  async register(email, password, name) {
    if (!email || !password) throw new Error('Email and password required');
    if (password.length < 6) throw new Error('Password must be at least 6 characters');
    if (this.db.isOnline) {
      try {
        const { getAuth, createUserWithEmailAndPassword, updateProfile } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        const fbAuth = getAuth(this.db._app);
        const cred = await createUserWithEmailAndPassword(fbAuth, email, password);
        if (name) await updateProfile(cred.user, { displayName: name });
        const user = { uid: cred.user.uid, email, name: name || email.split('@')[0] };
        this._user = user;
        this.db.saveUser(user);
        return user;
      } catch (err) {
        if (err.code !== 'auth/configuration-not-found') throw new Error(this._fbErrMsg(err.code));
      }
    }
    // Demo local registration
    const stored = this.db._localGet('fp_accounts', []);
    if (stored.find(a => a.email === email)) throw new Error('Email already registered');
    const uid = 'local_' + Math.random().toString(36).slice(2);
    stored.push({ uid, email, password: btoa(password), name });
    localStorage.setItem('fp_accounts', JSON.stringify(stored));
    const user = { uid, email, name: name || email.split('@')[0] };
    this._user = user;
    this.db.saveUser(user);
    return user;
  }

  async signOut() {
    if (this.db.isOnline) {
      try {
        const { getAuth, signOut } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
        await signOut(getAuth(this.db._app));
      } catch (_) {}
    }
    this._user = null;
    this.db.clearUser();
  }

  updateProfile(p) {
    if (this._user) {
      this._user = { ...this._user, ...p };
      this.db.saveUser(this._user);
    }
  }

  _fbErrMsg(code) {
    const map = {
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/email-already-in-use': 'Email already registered',
      'auth/invalid-email': 'Invalid email address',
      'auth/weak-password': 'Password too weak (min 6 chars)',
      'auth/too-many-requests': 'Too many attempts. Try again later.',
    };
    return map[code] || 'Authentication error: ' + code;
  }
}
