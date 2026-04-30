// utils.js — Shared helpers

export function toast(message, type = 'ok') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

export function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);
  if (diffDays === 0) return 'Today ' + d.toLocaleTimeString('en-MY', { hour:'2-digit', minute:'2-digit' });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-MY', { weekday: 'short' });
  return d.toLocaleDateString('en-MY', { day:'numeric', month:'short' });
}

export function formatDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-MY', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function outcomeClass(outcome) {
  if (!outcome) return 'neutral';
  const o = outcome.toLowerCase();
  if (o.includes('won') || o.includes('closed w')) return 'won';
  if (o.includes('lost') || o.includes('not interested')) return 'lost';
  if (o.includes('follow')) return 'follow';
  return 'neutral';
}

export function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
