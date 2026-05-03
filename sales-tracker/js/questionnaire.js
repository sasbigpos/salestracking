// questionnaire.js — Custom question builder

export class QuestionnaireManager {
  constructor(db) {
    this.db = db;
    this.questions = [];
    this._editId = null;
  }

  init() {
    this.questions = this.db.getQuestions();
    this.render();
    this.renderDynamicFields();
    this._bindModal();
  }

  render() {
    const list = document.getElementById('questionList');
    if (!list) return;
    this.questions = this.db.getQuestions();
    if (!this.questions.length) {
      list.innerHTML = '<div class="empty-state">No custom questions yet. Click <strong>Add Question</strong> to start.</div>';
      return;
    }
    list.innerHTML = this.questions.map((q, i) => `
      <div class="q-item" data-id="${esc(q.id)}">
        <div class="q-drag">
          <svg viewBox="0 0 24 24" style="width:16px;height:16px;opacity:.4"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>
        </div>
        <div class="q-body">
          <div class="q-label">${esc(q.label)}</div>
          <div class="q-meta">${typeLabel(q.type)}${q.required === 'true' ? ' · Required' : ' · Optional'}${q.options?.length ? ` · ${q.options.length} options` : ''}</div>
        </div>
        <div class="q-actions">
          <button class="icon-btn edit-q" data-id="${esc(q.id)}" title="Edit">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="icon-btn del-q" data-id="${esc(q.id)}" title="Delete">
            <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          </button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.edit-q').forEach(btn => {
      btn.addEventListener('click', () => this.openModal(btn.dataset.id));
    });
    list.querySelectorAll('.del-q').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Delete this question?')) return;
        this.questions = this.questions.filter(q => q.id !== btn.dataset.id);
        this.db.saveQuestions(this.questions);
        this.render();
        this.renderDynamicFields();
      });
    });
  }

  renderDynamicFields() {
    const container = document.getElementById('dynamicFields');
    if (!container) return;
    const qs = this.db.getQuestions();
    container.innerHTML = qs.map(q => `
      <div class="form-group">
        <label>${esc(q.label)}${q.required === 'true' ? ' <span class="req">*</span>' : ''}</label>
        ${this._renderInput(q)}
      </div>
    `).join('');
  }

  _renderInput(q) {
    const id = `dyn_${q.id}`;
    const req = q.required === 'true' ? 'required' : '';
    switch (q.type) {
      case 'text':
        return `<input type="text" id="${id}" ${req} />`;
      case 'textarea':
        return `<textarea id="${id}" rows="3" ${req}></textarea>`;
      case 'number':
        return `<input type="number" id="${id}" ${req} />`;
      case 'date':
        return `<input type="date" id="${id}" ${req} />`;
      case 'select': {
        const opts = (q.options || []).map(o => `<option>${esc(o)}</option>`).join('');
        return `<select id="${id}" ${req}><option value="">Select…</option>${opts}</select>`;
      }
      case 'radio': {
        const opts = (q.options || []).map(o => `
          <label class="radio-label"><input type="radio" name="${id}" value="${esc(o)}" ${req} /> ${esc(o)}</label>
        `).join('');
        return `<div class="radio-group">${opts}</div>`;
      }
      case 'checkbox': {
        const opts = (q.options || []).map(o => `
          <label class="check-label"><input type="checkbox" name="${id}" value="${esc(o)}" /> ${esc(o)}</label>
        `).join('');
        return `<div class="check-group">${opts}</div>`;
      }
      default:
        return `<input type="text" id="${id}" ${req} />`;
    }
  }

  collectAnswers() {
    const answers = {};
    const qs = this.db.getQuestions();
    qs.forEach(q => {
      const id = `dyn_${q.id}`;
      if (q.type === 'checkbox') {
        const checked = [...document.querySelectorAll(`input[name="${id}"]:checked`)].map(el => el.value);
        answers[q.id] = checked;
      } else if (q.type === 'radio') {
        const el = document.querySelector(`input[name="${id}"]:checked`);
        answers[q.id] = el?.value || '';
      } else {
        const el = document.getElementById(id);
        answers[q.id] = el?.value || '';
      }
    });
    return answers;
  }

  openModal(editId = null) {
    this._editId = editId;
    const modal = document.getElementById('qModal');
    const titleEl = document.getElementById('qModalTitle');
    const form = document.getElementById('qForm');
    form.reset();
    document.getElementById('optionsGroup').style.display = 'none';

    if (editId) {
      const q = this.questions.find(x => x.id === editId);
      if (q) {
        document.getElementById('qLabel').value = q.label;
        document.getElementById('qType').value = q.type;
        document.getElementById('qRequired').value = q.required;
        if (q.options?.length) {
          document.getElementById('qOptions').value = q.options.join('\n');
          document.getElementById('optionsGroup').style.display = 'block';
        }
      }
      titleEl.textContent = 'Edit Question';
    } else {
      titleEl.textContent = 'New Question';
    }
    modal.classList.remove('hidden');
  }

  _bindModal() {
    const modal = document.getElementById('qModal');
    const close = () => modal.classList.add('hidden');
    document.getElementById('qModalClose').addEventListener('click', close);
    document.getElementById('qModalCancel').addEventListener('click', close);
    modal.querySelector('.modal-backdrop').addEventListener('click', close);

    document.getElementById('qType').addEventListener('change', e => {
      const show = ['select','radio','checkbox'].includes(e.target.value);
      document.getElementById('optionsGroup').style.display = show ? 'block' : 'none';
    });

    document.getElementById('qForm').addEventListener('submit', e => {
      e.preventDefault();
      const label = document.getElementById('qLabel').value.trim();
      const type = document.getElementById('qType').value;
      const required = document.getElementById('qRequired').value;
      const optionsRaw = document.getElementById('qOptions').value;
      const options = optionsRaw ? optionsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];

      if (!label) return;

      if (this._editId) {
        this.questions = this.questions.map(q => q.id === this._editId ? { ...q, label, type, required, options } : q);
      } else {
        this.questions.push({ id: `q_${Date.now()}`, label, type, required, options });
      }
      this.db.saveQuestions(this.questions);
      this.render();
      this.renderDynamicFields();
      close();
    });
  }
}

function typeLabel(type) {
  const map = { text:'Short Text', textarea:'Long Text', select:'Dropdown', radio:'Multiple Choice', checkbox:'Checkboxes', number:'Number', date:'Date' };
  return map[type] || type;
}

function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
