// usermgmt.js — User Management (superadmin & admin)

export class UserManager {
  constructor(auth, db) {
    this.auth = auth;
    this.db   = db;
    this._editUid = null;
  }

  // ── Render user list ──────────────────────────
  render() {
    const container = document.getElementById('userListContainer');
    if (!container) return;

    const accounts = this.auth.getAllAccounts();
    const me = this.auth.currentUser();
    const isSuperAdmin = this.auth.isSuperAdmin();

    container.innerHTML = `
      <div class="user-table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Team</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${accounts.map(acc => {
              const isMe = acc.uid === me?.uid;
              const isSA = acc.uid === 'superadmin';
              const roleBadge = rolePill(acc.role);
              const statusBadge = acc.active
                ? '<span class="status-dot active">Active</span>'
                : '<span class="status-dot inactive">Inactive</span>';
              return `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:.6rem">
                      <div class="avatar sm" style="background:${avatarColor(acc.role)}">${(acc.name||acc.email).charAt(0).toUpperCase()}</div>
                      <div>
                        <div style="font-weight:600;font-size:.88rem">${esc(acc.name||'—')}</div>
                        ${isMe ? '<div style="font-size:.72rem;color:var(--accent);font-family:var(--font-mono)">You</div>' : ''}
                      </div>
                    </div>
                  </td>
                  <td style="font-family:var(--font-mono);font-size:.78rem;color:var(--text2)">${esc(acc.email)}</td>
                  <td>${roleBadge}</td>
                  <td style="font-size:.82rem;color:var(--text2)">${esc(acc.team||'—')}</td>
                  <td>${statusBadge}</td>
                  <td>
                    ${!isSA || isSuperAdmin ? `
                      <button class="icon-btn edit-user-btn" data-uid="${acc.uid}" title="Edit"
                        ${isSA && !isSuperAdmin ? 'disabled' : ''}>
                        <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      ${!isSA && !isMe ? `
                        <button class="icon-btn del-user-btn" data-uid="${acc.uid}" title="Delete" style="margin-left:.25rem">
                          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      ` : ''}
                    ` : '<span style="color:var(--text3);font-size:.75rem">Protected</span>'}
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    container.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openEditModal(btn.dataset.uid));
    });
    container.querySelectorAll('.del-user-btn').forEach(btn => {
      btn.addEventListener('click', () => this._deleteUser(btn.dataset.uid));
    });
  }

  // ── Edit Modal ────────────────────────────────
  openEditModal(uid) {
    const acc = this.auth.getAllAccounts().find(a => a.uid === uid);
    if (!acc) return;
    this._editUid = uid;
    const me = this.auth.currentUser();
    const isSuperAdmin = this.auth.isSuperAdmin();
    const isSA = uid === 'superadmin';

    document.getElementById('editUserTitle').textContent = `Edit: ${acc.name || acc.email}`;
    document.getElementById('editUserName').value   = acc.name || '';
    document.getElementById('editUserTeam').value   = acc.team || '';
    document.getElementById('editUserEmail').value  = acc.email;
    document.getElementById('editUserRole').value   = acc.role || 'user';
    document.getElementById('editUserActive').value = acc.active ? 'true' : 'false';
    document.getElementById('editUserPassword').value = '';

    // Role selector — only superadmin can assign roles; protect SA row
    const roleSelect  = document.getElementById('editUserRole');
    const activeSelect= document.getElementById('editUserActive');
    roleSelect.disabled   = !isSuperAdmin || isSA;
    activeSelect.disabled = isSA;

    document.getElementById('editUserModal').classList.remove('hidden');
  }

  bindModal() {
    const modal = document.getElementById('editUserModal');
    const close = () => modal.classList.add('hidden');
    document.getElementById('editUserModalClose').addEventListener('click', close);
    document.getElementById('editUserCancel').addEventListener('click', close);
    modal.querySelector('.modal-backdrop').addEventListener('click', close);

    document.getElementById('editUserForm').addEventListener('submit', e => {
      e.preventDefault();
      const changes = {
        name:   document.getElementById('editUserName').value.trim(),
        team:   document.getElementById('editUserTeam').value.trim(),
        role:   document.getElementById('editUserRole').value,
        active: document.getElementById('editUserActive').value === 'true',
      };
      const newPwd = document.getElementById('editUserPassword').value;
      if (newPwd) {
        if (newPwd.length < 6) { alert('Password must be at least 6 characters'); return; }
        changes.password = btoa(newPwd);
      }
      try {
        this.auth.updateAccount(this._editUid, changes);
        // Sync to Firestore if online
        if (this.db.isOnline && changes.role) {
          this.db.saveUserRole(this._editUid, changes.role).catch(() => {});
        }
        close();
        this.render();
        showToast('User updated successfully');
      } catch (err) {
        alert(err.message);
      }
    });

    // Add new user form
    document.getElementById('addUserForm')?.addEventListener('submit', e => {
      e.preventDefault();
      const name  = document.getElementById('newUserName').value.trim();
      const email = document.getElementById('newUserEmail').value.trim();
      const pwd   = document.getElementById('newUserPassword').value;
      const role  = document.getElementById('newUserRole').value;
      const team  = document.getElementById('newUserTeam').value.trim();
      if (!email || !pwd) return;
      if (pwd.length < 6) { alert('Password must be at least 6 characters'); return; }
      const accounts = this.db._localGet('fp_accounts', []);
      if (accounts.find(a => a.email === email)) { alert('Email already registered'); return; }
      const uid = 'local_' + Math.random().toString(36).slice(2);
      accounts.push({ uid, email, password: btoa(pwd), name: name || email.split('@')[0], role, team, active: true });
      localStorage.setItem('fp_accounts', JSON.stringify(accounts));
      document.getElementById('addUserForm').reset();
      this.render();
      showToast('User created');
    });
  }

  _deleteUser(uid) {
    const acc = this.auth.getAllAccounts().find(a => a.uid === uid);
    if (!confirm(`Delete user "${acc?.name || acc?.email}"? This cannot be undone.`)) return;
    try {
      this.auth.deleteAccount(uid);
      this.render();
      showToast('User deleted');
    } catch (err) { alert(err.message); }
  }
}

// ── Helpers ───────────────────────────────────────
function rolePill(role) {
  const styles = {
    superadmin: 'background:rgba(245,166,35,.18);color:#f5a623;border:1px solid rgba(245,166,35,.3)',
    admin:      'background:rgba(79,142,247,.15);color:#4f8ef7;border:1px solid rgba(79,142,247,.3)',
    user:       'background:var(--surface2);color:var(--text2);border:1px solid var(--border)',
  };
  const labels = { superadmin:'Super Admin', admin:'Admin', user:'User' };
  return `<span style="display:inline-block;padding:.2rem .65rem;border-radius:99px;font-size:.72rem;font-weight:600;${styles[role]||styles.user}">${labels[role]||role}</span>`;
}

function avatarColor(role) {
  if (role === 'superadmin') return 'linear-gradient(135deg,#f5a623,#ff6b35)';
  if (role === 'admin')      return 'linear-gradient(135deg,#4f8ef7,#7b5ea7)';
  return 'linear-gradient(135deg,#3ecf8e,#1ea87e)';
}

function esc(str) {
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'ok') {
  const c = document.getElementById('toastContainer');
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
