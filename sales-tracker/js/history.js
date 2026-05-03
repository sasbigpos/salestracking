// history.js — Activity history (role-aware)

import { MapService } from './maps.js';
import { formatDateTime, outcomeClass } from './utils.js';

export class HistoryManager {
  constructor(db, q) {
    this.db   = db;
    this.q    = q;
    this.auth = null;   // set via init(auth)
    this._all = [];
    this._modalMap = null;
  }

  init(auth) {
    this.auth = auth;
    document.getElementById('histSearch').addEventListener('input',  () => this._filter());
    document.getElementById('histFilter').addEventListener('change', () => this._filter());
    document.getElementById('modalClose').addEventListener('click',  () => this._closeModal());
    document.querySelector('#detailModal .modal-backdrop').addEventListener('click', () => this._closeModal());
  }

  async render() {
    const user = this.auth?.currentUser();
    // Admins see all activities; normal users see only their own
    this._all = this.auth?.isAdmin()
      ? await this.db.getActivities()
      : await this.db.getActivities(user?.uid);
    this._filter();
  }

  _filter() {
    const search = document.getElementById('histSearch').value.toLowerCase();
    const type   = document.getElementById('histFilter').value;
    const filtered = this._all.filter(a => {
      const matchSearch = !search ||
        a.clientName?.toLowerCase().includes(search) ||
        a.activityType?.toLowerCase().includes(search) ||
        a.notes?.toLowerCase().includes(search) ||
        a.userName?.toLowerCase().includes(search);
      const matchType = !type || a.activityType === type;
      return matchSearch && matchType;
    });
    this._renderTable(filtered);
  }

  _renderTable(activities) {
    const body      = document.getElementById('histBody');
    const isAdmin   = this.auth?.isAdmin();
    const isSuperAdmin = this.auth?.isSuperAdmin();

    if (!activities.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-td">No activities found.</td></tr>';
      return;
    }

    body.innerHTML = activities.map(a => `
      <tr>
        <td style="white-space:nowrap;font-family:var(--font-mono);font-size:.78rem;color:var(--text2)">${formatDateTime(a.timestamp)}</td>
        <td><strong>${esc(a.clientName)}</strong></td>
        <td>${esc(a.activityType)}</td>
        <td><span class="outcome-pill ${outcomeClass(a.outcome)}">${esc(a.outcome) || '—'}</span></td>
        ${isAdmin ? `<td style="font-size:.8rem;color:var(--text2)">${esc(a.userName||'—')}</td>` : ''}
        <td style="font-family:var(--font-mono);font-size:.75rem;color:var(--text2)">
          ${a.lat ? `${a.lat.toFixed(4)}, ${a.lng.toFixed(4)}` : '<span style="color:var(--text3)">No GPS</span>'}
        </td>
        <td>
          <button class="icon-btn view-btn" data-id="${esc(a.id)}" title="View">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          ${isSuperAdmin || a.userId === this.auth?.currentUser()?.uid ? `
          <button class="icon-btn del-btn" data-id="${esc(a.id)}" title="Delete" style="margin-left:.25rem">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>` : ''}
        </td>
      </tr>
    `).join('');

    // Update thead to include Rep column for admins
    const thead = document.querySelector('#histTable thead tr');
    if (thead) {
      const hasRepCol = thead.querySelector('.rep-col');
      if (isAdmin && !hasRepCol) {
        const th = document.createElement('th');
        th.className = 'rep-col';
        th.textContent = 'Rep';
        thead.children[3].after(th);
      } else if (!isAdmin && hasRepCol) {
        hasRepCol.remove();
      }
    }

    body.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => this.openDetail(btn.dataset.id));
    });
    body.querySelectorAll('.del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this activity?')) return;
        await this.db.deleteActivity(btn.dataset.id);
        await this.render();
      });
    });
  }

  async openDetail(id) {
    const all  = await this.db.getActivities();
    const activity = all.find(a => a.id === id);
    if (!activity) return;

    // Access check: normal users can only see their own
    if (!this.auth?.isAdmin() && activity.userId !== this.auth?.currentUser()?.uid) {
      return;
    }

    document.getElementById('modalTitle').textContent = esc(activity.clientName);

    const questions = this.db.getQuestions();
    const answers   = activity.customAnswers || {};
    const customHtml = questions.map(q => {
      const val = answers[q.id];
      if (!val || (Array.isArray(val) && !val.length)) return '';
      return `<div class="detail-row"><span class="detail-label">${esc(q.label)}</span><span class="detail-val">${esc(Array.isArray(val) ? val.join(', ') : val)}</span></div>`;
    }).join('');

    document.getElementById('modalBody').innerHTML = `
      <div class="detail-grid">
        <div class="detail-row"><span class="detail-label">Date & Time</span><span class="detail-val">${formatDateTime(activity.timestamp)}</span></div>
        <div class="detail-row"><span class="detail-label">Activity Type</span><span class="detail-val">${esc(activity.activityType)}</span></div>
        <div class="detail-row"><span class="detail-label">Outcome</span><span class="detail-val"><span class="outcome-pill ${outcomeClass(activity.outcome)}">${esc(activity.outcome)||'—'}</span></span></div>
        ${activity.userName ? `<div class="detail-row"><span class="detail-label">Sales Rep</span><span class="detail-val">${esc(activity.userName)}</span></div>` : ''}
        ${activity.lat ? `<div class="detail-row"><span class="detail-label">GPS</span><span class="detail-val" style="font-family:var(--font-mono);font-size:.8rem">${activity.lat.toFixed(6)}, ${activity.lng.toFixed(6)}${activity.accuracy ? ` ±${Math.round(activity.accuracy)}m` : ''}</span></div>` : ''}
        ${activity.notes ? `<div class="detail-row full"><span class="detail-label">Notes</span><p class="detail-notes">${esc(activity.notes)}</p></div>` : ''}
        ${customHtml}
      </div>
      <style>
        .detail-grid{display:flex;flex-direction:column;gap:.6rem}
        .detail-row{display:flex;gap:.75rem;align-items:baseline}
        .detail-row.full{flex-direction:column;gap:.3rem}
        .detail-label{font-size:.72rem;font-family:var(--font-mono);color:var(--text3);text-transform:uppercase;letter-spacing:.05em;min-width:110px;flex-shrink:0}
        .detail-val{font-size:.88rem}
        .detail-notes{font-size:.88rem;color:var(--text2);line-height:1.6;white-space:pre-wrap}
      </style>
    `;

    document.getElementById('detailModal').classList.remove('hidden');

    const mapEl = document.getElementById('modalMap');
    if (activity.lat) {
      mapEl.style.display = 'block';
      await MapService.loadLeaflet();
      if (this._modalMap) { try { this._modalMap.remove(); } catch(_){} }
      this._modalMap = MapService.createMap('modalMap', activity.lat, activity.lng, 15);
      MapService.addMarker(this._modalMap, activity.lat, activity.lng, `<strong>${esc(activity.clientName)}</strong>`);
      setTimeout(() => MapService.invalidate(this._modalMap), 100);
    } else {
      mapEl.style.display = 'none';
    }
  }

  _closeModal() {
    document.getElementById('detailModal').classList.add('hidden');
    if (this._modalMap) { try { this._modalMap.remove(); } catch(_){} this._modalMap = null; }
  }
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
