/**
 * Farlands Hackathon — Admin console
 * Full dashboard: stats, registrations, teams, participants (CRUD), payments + proof view.
 */
import './hackathon.css';
import './admin.css';

const loginView = document.getElementById('admin-login-view');
const dashView = document.getElementById('admin-dash-view');
const loginForm = document.getElementById('admin-login-form');
const loginError = document.getElementById('admin-login-error');
const loginBtn = document.getElementById('admin-login-btn');
const logoutBtn = document.getElementById('admin-logout-btn');
const banner = document.getElementById('admin-banner');
const modal = document.getElementById('admin-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalFoot = document.getElementById('modal-foot');

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function showLogin() {
  loginView.hidden = false;
  dashView.hidden = true;
}

function showDash() {
  loginView.hidden = true;
  dashView.hidden = false;
}

function setBanner(message, kind = 'info') {
  if (!message) {
    banner.hidden = true;
    banner.textContent = '';
    return;
  }
  banner.hidden = false;
  banner.textContent = message;
  banner.dataset.kind = kind;
  if (kind === 'ok' || kind === 'error') {
    setTimeout(() => setBanner(''), 4000);
  }
}

function setLoginError(message) {
  if (!message) {
    loginError.hidden = true;
    loginError.textContent = '';
    return;
  }
  loginError.hidden = false;
  loginError.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
}

function formatMoney(amount, currency = 'INR') {
  if (amount == null) return '—';
  const rupees = Number(amount) / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(rupees);
  } catch {
    return `₹${rupees.toFixed(0)}`;
  }
}

function statusBadge(status) {
  const s = String(status || '—').toLowerCase();
  let cls = 'badge';
  if (s.includes('confirm') || s === 'paid' || s === 'active' || s === 'verified') cls += ' badge-ok';
  else if (s.includes('pending') || s.includes('process')) cls += ' badge-warn';
  else if (s.includes('fail') || s.includes('reject') || s === 'disabled') cls += ' badge-err';
  else cls += ' badge-muted';
  return `<span class="${cls}">${escapeHtml(status || '—')}</span>`;
}

/* ── Modal ─────────────────────────────────────────────────────────────── */
function openModal(title, bodyHtml, footHtml = '') {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalFoot.innerHTML = footHtml;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  modal.hidden = true;
  modalBody.innerHTML = '';
  modalFoot.innerHTML = '';
  document.body.style.overflow = '';
}

modal?.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closeModal);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

/* ── Auth ──────────────────────────────────────────────────────────────── */
async function trySession() {
  try {
    await api('/api/admin/stats');
    showDash();
    await loadStats();
    return true;
  } catch {
    showLogin();
    return false;
  }
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setLoginError('');
  const email = document.getElementById('admin-email')?.value?.trim();
  const password = document.getElementById('admin-password')?.value || '';
  if (!email || !password) {
    setLoginError('Email and password are required.');
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = 'Signing in…';
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (result?.user?.role !== 'admin') {
      setLoginError('This account is not an admin. Use the organizer credentials.');
      await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
      return;
    }
    showDash();
    setBanner('Signed in as admin.', 'ok');
    await loadStats();
  } catch (err) {
    setLoginError(err.message || 'Sign in failed.');
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign in';
  }
});

logoutBtn?.addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  showLogin();
  setBanner('');
  closeModal();
});

/* ── Tabs ──────────────────────────────────────────────────────────────── */
document.querySelectorAll('.admin-tabs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-tabs button').forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    const tab = btn.dataset.tab;
    document.querySelectorAll('.admin-panel').forEach((p) => {
      p.hidden = p.id !== `panel-${tab}`;
    });
    if (tab === 'stats') loadStats();
    if (tab === 'registrations') loadRegistrations();
    if (tab === 'teams') loadTeams();
    if (tab === 'participants') loadParticipants();
    if (tab === 'payments') loadPayments();
  });
});

document.getElementById('stats-refresh')?.addEventListener('click', loadStats);

/* ── Stats ─────────────────────────────────────────────────────────────── */
async function loadStats() {
  const grid = document.getElementById('stats-grid');
  grid.innerHTML = '<div class="admin-stat"><span class="label">Loading…</span><strong>—</strong></div>';
  try {
    const data = await api('/api/admin/stats');
    const stats = data?.statistics || data?.stats || data || {};
    const entries = [
      ['Teams', stats.totalTeams ?? stats.teams ?? stats.teamCount],
      ['Participants', stats.totalParticipants ?? stats.participants ?? stats.participantCount],
      ['Registrations', stats.totalRegistrations ?? stats.registrations ?? stats.registrationCount],
      ['Pending payments', stats.pendingPayments ?? stats.paymentsPending],
      ['Verified payments', stats.verifiedPayments ?? stats.paidPayments],
      ["Today's registrations", stats.todayRegistrations],
    ].filter(([, v]) => v !== undefined && v !== null);

    if (!entries.length) {
      const keys = Object.keys(stats);
      if (!keys.length) {
        grid.innerHTML = '<div class="admin-stat"><span class="label">No stats returned</span><strong>0</strong></div>';
        return;
      }
      grid.innerHTML = keys
        .map(
          (k) =>
            `<div class="admin-stat"><span class="label">${escapeHtml(k)}</span><strong>${escapeHtml(String(stats[k]))}</strong></div>`
        )
        .join('');
      return;
    }
    grid.innerHTML = entries
      .map(
        ([label, value]) =>
          `<div class="admin-stat"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`
      )
      .join('');
  } catch (err) {
    grid.innerHTML = `<div class="admin-stat"><span class="label">Error</span><strong>${escapeHtml(err.message)}</strong></div>`;
    if (err.status === 401 || err.status === 403) showLogin();
  }
}

/* ── Registrations ─────────────────────────────────────────────────────── */
async function loadRegistrations() {
  const tbody = document.querySelector('#regs-table tbody');
  const q = document.getElementById('regs-search')?.value?.trim() || '';
  const status = document.getElementById('regs-status')?.value || '';
  tbody.innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (q) params.set('search', q);
    if (status) params.set('status', status);
    const data = await api(`/api/admin/registrations?${params}`);
    const rows = data?.registrations || data?.items || data?.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No registrations found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((r) => {
        const regNum = r.registrationNumber || r.registration_number || '—';
        const teamName = r.team?.teamName || r.team?.team_name || '—';
        const teamId = r.team?.teamId || r.team?.team_id || '';
        const members = r.team?.members || [];
        const memberCount = members.length;
        const fee = formatMoney(r.feeAmount ?? r.fee_amount, r.currency);
        const st = r.status || '—';
        const created = formatDate(r.createdAt || r.created_at);
        const teamUuid = r.team?.id;
        return `<tr>
          <td><code>${escapeHtml(regNum)}</code></td>
          <td>
            <strong>${escapeHtml(teamName)}</strong>
            ${teamId ? `<br><span class="muted mono">${escapeHtml(teamId)}</span>` : ''}
          </td>
          <td>${memberCount}</td>
          <td>${escapeHtml(fee)}</td>
          <td>${statusBadge(st)}</td>
          <td class="muted">${escapeHtml(created)}</td>
          <td>
            ${teamUuid ? `<button type="button" class="admin-btn-sm" data-view-team="${escapeHtml(teamUuid)}">View team</button>` : ''}
          </td>
        </tr>`;
      })
      .join('');
    bindTeamViewButtons(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    if (err.status === 401 || err.status === 403) showLogin();
  }
}

/* ── Teams ─────────────────────────────────────────────────────────────── */
async function loadTeams() {
  const tbody = document.querySelector('#teams-table tbody');
  const q = document.getElementById('teams-search')?.value?.trim() || '';
  tbody.innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (q) params.set('search', q);
    const data = await api(`/api/admin/teams?${params}`);
    const rows = data?.teams || data?.items || data?.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No teams found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((t) => {
        const id = t.teamId || t.team_id || '—';
        const name = t.teamName || t.team_name || t.name || '—';
        const status = t.status || '—';
        const created = formatDate(t.createdAt || t.created_at);
        const members = t.members || t.participants || [];
        const regStatus = t.registration?.status || '—';
        const uuid = t.id;
        return `<tr>
          <td><code>${escapeHtml(id)}</code></td>
          <td><strong>${escapeHtml(name)}</strong></td>
          <td>${members.length}</td>
          <td>${statusBadge(regStatus)}</td>
          <td>${statusBadge(status)}</td>
          <td class="muted">${escapeHtml(created)}</td>
          <td>
            <button type="button" class="admin-btn-sm" data-view-team="${escapeHtml(uuid)}">Details</button>
          </td>
        </tr>`;
      })
      .join('');
    bindTeamViewButtons(tbody);
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    if (err.status === 401 || err.status === 403) showLogin();
  }
}

function bindTeamViewButtons(root) {
  root.querySelectorAll('[data-view-team]').forEach((btn) => {
    btn.addEventListener('click', () => openTeamDetail(btn.getAttribute('data-view-team')));
  });
}

async function openTeamDetail(id) {
  openModal('Team details', '<p class="muted">Loading…</p>', '');
  try {
    const data = await api(`/api/admin/teams/${id}`);
    const t = data?.team || data;
    const members = t.members || [];
    const reg = t.registration;
    const payments = t.payments || [];

    const membersHtml =
      members.length === 0
        ? '<p class="muted">No members.</p>'
        : `<div class="detail-list">${members
            .map(
              (m) => `
          <div class="detail-row">
            <div>
              <strong>${escapeHtml(m.name)}</strong>
              <span class="muted"> · ${escapeHtml(m.email || '')}</span>
              ${m.phone ? `<br><span class="muted">${escapeHtml(m.phone)}</span>` : ''}
            </div>
            <div class="detail-meta">
              <code>${escapeHtml(m.participant_id || m.participantId || '')}</code>
              ${statusBadge(m.status)}
              <button type="button" class="admin-btn-sm" data-edit-participant="${escapeHtml(m.id)}">Edit</button>
            </div>
          </div>`
            )
            .join('')}</div>`;

    const regHtml = reg
      ? `<div class="info-grid">
          <div><span class="label">Reg #</span><strong>${escapeHtml(reg.registration_number || reg.registrationNumber || '—')}</strong></div>
          <div><span class="label">Status</span>${statusBadge(reg.status)}</div>
          <div><span class="label">Fee</span><strong>${formatMoney(reg.fee_amount ?? reg.feeAmount, reg.currency)}</strong></div>
          <div><span class="label">Confirmed</span><strong>${formatDate(reg.confirmed_at || reg.confirmedAt)}</strong></div>
        </div>`
      : '<p class="muted">No registration record.</p>';

    const payHtml =
      payments.length === 0
        ? '<p class="muted">No payment proofs.</p>'
        : `<div class="detail-list">${payments
            .map(
              (p) => `
          <div class="detail-row">
            <div>
              <code>${escapeHtml(p.utr || '—')}</code>
              <span class="muted"> · ${formatMoney(p.amount, p.currency)}</span>
            </div>
            <div class="detail-meta">
              ${statusBadge(p.status)}
              <button type="button" class="admin-btn-sm" data-view-payment="${escapeHtml(p.id)}">View proof</button>
            </div>
          </div>`
            )
            .join('')}</div>`;

    const body = `
      <div class="info-grid">
        <div><span class="label">Team ID</span><strong><code>${escapeHtml(t.teamId || t.team_id || '—')}</code></strong></div>
        <div><span class="label">Name</span><strong>${escapeHtml(t.teamName || t.team_name || '—')}</strong></div>
        <div><span class="label">Status</span>${statusBadge(t.status)}</div>
        <div><span class="label">Created</span><strong>${formatDate(t.createdAt || t.created_at)}</strong></div>
      </div>
      <h3 class="section-title">Registration</h3>
      ${regHtml}
      <h3 class="section-title">Members (${members.length})</h3>
      ${membersHtml}
      <h3 class="section-title">Payments</h3>
      ${payHtml}
    `;

    const foot = `
      <button type="button" class="admin-btn-sm" id="btn-edit-team">Edit team</button>
      <button type="button" class="admin-btn-ghost" data-close-modal>Close</button>
    `;

    openModal(`Team · ${t.teamName || t.team_name || id}`, body, foot);

    modalFoot.querySelector('#btn-edit-team')?.addEventListener('click', () => openTeamEdit(t));
    modalBody.querySelectorAll('[data-edit-participant]').forEach((btn) => {
      btn.addEventListener('click', () => openParticipantEdit(btn.getAttribute('data-edit-participant')));
    });
    modalBody.querySelectorAll('[data-view-payment]').forEach((btn) => {
      btn.addEventListener('click', () => openPaymentDetail(btn.getAttribute('data-view-payment')));
    });
    modalFoot.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  } catch (err) {
    openModal('Team details', `<p class="admin-error">${escapeHtml(err.message)}</p>`, '');
  }
}

function openTeamEdit(team) {
  const name = team.teamName || team.team_name || '';
  const status = team.status || 'active';
  const body = `
    <form id="team-edit-form" class="admin-form">
      <label class="admin-field">
        <span>Team name</span>
        <input name="teamName" type="text" required minlength="3" maxlength="50" value="${escapeHtml(name)}" />
      </label>
      <label class="admin-field">
        <span>Status</span>
        <select name="status">
          <option value="active" ${status === 'active' ? 'selected' : ''}>Active</option>
          <option value="disabled" ${status === 'disabled' ? 'selected' : ''}>Disabled</option>
        </select>
      </label>
    </form>
  `;
  const foot = `
    <button type="button" class="admin-btn-primary" id="btn-save-team">Save changes</button>
    <button type="button" class="admin-btn-ghost" data-close-modal>Cancel</button>
  `;
  openModal('Edit team', body, foot);
  modalFoot.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  modalFoot.querySelector('#btn-save-team')?.addEventListener('click', async () => {
    const form = document.getElementById('team-edit-form');
    const fd = new FormData(form);
    const payload = {
      teamName: String(fd.get('teamName') || '').trim(),
      status: String(fd.get('status') || 'active'),
    };
    try {
      await api(`/api/admin/teams/${team.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setBanner('Team updated.', 'ok');
      closeModal();
      loadTeams();
    } catch (err) {
      setBanner(err.message, 'error');
    }
  });
}

/* ── Participants ──────────────────────────────────────────────────────── */
async function loadParticipants() {
  const tbody = document.querySelector('#participants-table tbody');
  const q = document.getElementById('participants-search')?.value?.trim() || '';
  tbody.innerHTML = '<tr><td colspan="7" class="muted">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (q) params.set('search', q);
    const data = await api(`/api/admin/participants?${params}`);
    const rows = data?.participants || data?.items || data?.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="muted">No participants found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((p) => {
        const name = p.name || '—';
        const email = p.email || '—';
        const phone = p.phone || '—';
        const pid = p.participantId || p.participant_id || '—';
        const status = p.status || '—';
        const teamName = p.teamName || p.team_name || '—';
        return `<tr>
          <td><strong>${escapeHtml(name)}</strong></td>
          <td>${escapeHtml(email)}</td>
          <td class="muted">${escapeHtml(phone)}</td>
          <td><code>${escapeHtml(pid)}</code></td>
          <td>${escapeHtml(teamName)}</td>
          <td>${statusBadge(status)}</td>
          <td>
            <button type="button" class="admin-btn-sm" data-edit-participant="${escapeHtml(p.id)}">Edit</button>
            <button type="button" class="admin-btn-sm" data-view-participant="${escapeHtml(p.id)}">View</button>
          </td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-edit-participant]').forEach((btn) => {
      btn.addEventListener('click', () => openParticipantEdit(btn.getAttribute('data-edit-participant')));
    });
    tbody.querySelectorAll('[data-view-participant]').forEach((btn) => {
      btn.addEventListener('click', () => openParticipantView(btn.getAttribute('data-view-participant')));
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(err.message)}</td></tr>`;
    if (err.status === 401 || err.status === 403) showLogin();
  }
}

async function openParticipantView(id) {
  openModal('Participant', '<p class="muted">Loading…</p>', '');
  try {
    const data = await api(`/api/admin/participants/${id}`);
    const p = data?.participant || data;
    const body = `
      <div class="info-grid">
        <div><span class="label">Name</span><strong>${escapeHtml(p.name)}</strong></div>
        <div><span class="label">Email</span><strong>${escapeHtml(p.email)}</strong></div>
        <div><span class="label">Phone</span><strong>${escapeHtml(p.phone || '—')}</strong></div>
        <div><span class="label">Participant ID</span><strong><code>${escapeHtml(p.participantId || p.participant_id || '—')}</code></strong></div>
        <div><span class="label">Team</span><strong>${escapeHtml(p.teamName || '—')}</strong></div>
        <div><span class="label">Status</span>${statusBadge(p.status)}</div>
        <div><span class="label">Checked in</span><strong>${p.isCheckedIn || p.is_checked_in ? 'Yes' : 'No'}</strong></div>
        <div><span class="label">Created</span><strong>${formatDate(p.createdAt || p.created_at)}</strong></div>
      </div>
    `;
    const foot = `
      <button type="button" class="admin-btn-primary" id="btn-edit-this-p">Edit</button>
      <button type="button" class="admin-btn-ghost" data-close-modal>Close</button>
    `;
    openModal(`Participant · ${p.name}`, body, foot);
    modalFoot.querySelector('#btn-edit-this-p')?.addEventListener('click', () => openParticipantEdit(id));
    modalFoot.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
  } catch (err) {
    openModal('Participant', `<p class="admin-error">${escapeHtml(err.message)}</p>`, '');
  }
}

async function openParticipantEdit(id) {
  openModal('Edit participant', '<p class="muted">Loading…</p>', '');
  try {
    const data = await api(`/api/admin/participants/${id}`);
    const p = data?.participant || data;
    const body = `
      <form id="participant-edit-form" class="admin-form">
        <label class="admin-field">
          <span>Name</span>
          <input name="name" type="text" required minlength="2" maxlength="100" value="${escapeHtml(p.name || '')}" />
        </label>
        <p class="muted" style="margin:0 0 12px">Email: <strong>${escapeHtml(p.email || '—')}</strong> (read-only)</p>
        <label class="admin-field">
          <span>Phone</span>
          <input name="phone" type="text" pattern="\\+?[0-9]{10,15}" value="${escapeHtml(p.phone || '')}" placeholder="+91…" />
        </label>
        <label class="admin-field">
          <span>Status</span>
          <select name="status">
            <option value="active" ${(p.status || '') === 'active' ? 'selected' : ''}>Active</option>
            <option value="disabled" ${(p.status || '') === 'disabled' ? 'selected' : ''}>Disabled</option>
          </select>
        </label>
      </form>
    `;
    const foot = `
      <button type="button" class="admin-btn-primary" id="btn-save-participant">Save changes</button>
      <button type="button" class="admin-btn-ghost" data-close-modal>Cancel</button>
    `;
    openModal(`Edit · ${p.name}`, body, foot);
    modalFoot.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);
    modalFoot.querySelector('#btn-save-participant')?.addEventListener('click', async () => {
      const form = document.getElementById('participant-edit-form');
      const fd = new FormData(form);
      const payload = {
        name: String(fd.get('name') || '').trim(),
        phone: String(fd.get('phone') || '').trim() || undefined,
        status: String(fd.get('status') || 'active'),
      };
      try {
        await api(`/api/admin/participants/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setBanner('Participant updated.', 'ok');
        closeModal();
        loadParticipants();
      } catch (err) {
        setBanner(err.message, 'error');
      }
    });
  } catch (err) {
    openModal('Edit participant', `<p class="admin-error">${escapeHtml(err.message)}</p>`, '');
  }
}

/* ── Payments ──────────────────────────────────────────────────────────── */
async function loadPayments() {
  const tbody = document.querySelector('#payments-table tbody');
  const status = document.getElementById('payments-status')?.value || '';
  const q = document.getElementById('payments-search')?.value?.trim() || '';
  tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
  try {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (status) params.set('status', status);
    if (q) params.set('search', q);
    const data = await api(`/api/admin/payments?${params}`);
    const rows = data?.payments || data?.items || data?.data || [];
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">No payment proofs found.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map((p) => {
        const id = p.id;
        const utr = p.utr || '—';
        const amount = formatMoney(p.amount, p.currency);
        const st = p.status || '—';
        const created = formatDate(p.submittedAt || p.createdAt || p.created_at);
        const teamName = p.teamName || '—';
        const teamId = p.teamId || '';
        const actions = [
          `<button type="button" class="admin-btn-sm" data-view-payment="${escapeHtml(id)}">View</button>`,
        ];
        if (st === 'pending_verification') {
          actions.push(
            `<button type="button" class="admin-btn-sm ok" data-verify="${escapeHtml(id)}">Verify</button>`,
            `<button type="button" class="admin-btn-sm danger" data-reject="${escapeHtml(id)}">Reject</button>`
          );
        }
        return `<tr>
          <td><code>${escapeHtml(utr)}</code></td>
          <td>
            <strong>${escapeHtml(teamName)}</strong>
            ${teamId ? `<br><span class="muted mono">${escapeHtml(teamId)}</span>` : ''}
          </td>
          <td>${escapeHtml(amount)}</td>
          <td>${statusBadge(st)}</td>
          <td class="muted">${escapeHtml(created)}</td>
          <td class="actions-cell">${actions.join(' ')}</td>
        </tr>`;
      })
      .join('');

    tbody.querySelectorAll('[data-view-payment]').forEach((btn) => {
      btn.addEventListener('click', () => openPaymentDetail(btn.getAttribute('data-view-payment')));
    });
    tbody.querySelectorAll('[data-verify]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-verify');
        btn.disabled = true;
        try {
          await api(`/api/admin/payments/${id}/verify`, { method: 'POST', body: '{}' });
          setBanner('Payment verified.', 'ok');
          loadPayments();
        } catch (err) {
          setBanner(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
    tbody.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-reject');
        const reason = window.prompt('Rejection reason (min 3 characters):', 'Invalid proof');
        if (!reason || reason.trim().length < 3) return;
        btn.disabled = true;
        try {
          await api(`/api/admin/payments/${id}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason: reason.trim() }),
          });
          setBanner('Payment rejected.', 'ok');
          loadPayments();
        } catch (err) {
          setBanner(err.message, 'error');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6">${escapeHtml(err.message)}</td></tr>`;
    if (err.status === 401 || err.status === 403) showLogin();
  }
}

async function openPaymentDetail(id) {
  openModal('Payment proof', '<p class="muted">Loading…</p>', '');
  try {
    const data = await api(`/api/admin/payments/${id}`);
    const p = data?.payment || data;
    const team = p.team;
    const members = team?.members || [];

    const membersHtml =
      members.length === 0
        ? ''
        : `<h3 class="section-title">Team members</h3>
           <ul class="simple-list">${members
             .map((m) => `<li>${escapeHtml(m.name)} <span class="muted">${escapeHtml(m.email || '')}</span></li>`)
             .join('')}</ul>`;

    const screenshot = p.screenshotUrl
      ? `<div class="proof-preview">
           <img src="${escapeHtml(p.screenshotUrl)}" alt="Payment screenshot" />
           <a href="${escapeHtml(p.screenshotUrl)}" target="_blank" rel="noopener" class="admin-btn-sm">Open full size</a>
         </div>`
      : '<p class="muted">Screenshot not available.</p>';

    const body = `
      <div class="info-grid">
        <div><span class="label">UTR</span><strong><code>${escapeHtml(p.utr || '—')}</code></strong></div>
        <div><span class="label">Amount</span><strong>${formatMoney(p.amount, p.currency)}</strong></div>
        <div><span class="label">Status</span>${statusBadge(p.status)}</div>
        <div><span class="label">Submitted</span><strong>${formatDate(p.submittedAt || p.created_at)}</strong></div>
        <div><span class="label">Reviewed</span><strong>${formatDate(p.reviewedAt || p.reviewed_at)}</strong></div>
        ${p.rejectionReason ? `<div><span class="label">Rejection reason</span><strong>${escapeHtml(p.rejectionReason)}</strong></div>` : ''}
      </div>
      ${
        team
          ? `<h3 class="section-title">Team</h3>
             <div class="info-grid">
               <div><span class="label">Name</span><strong>${escapeHtml(team.teamName || '—')}</strong></div>
               <div><span class="label">Team ID</span><strong><code>${escapeHtml(team.teamId || '—')}</code></strong></div>
             </div>
             ${membersHtml}`
          : ''
      }
      <h3 class="section-title">Screenshot</h3>
      ${screenshot}
    `;

    let foot = `<button type="button" class="admin-btn-ghost" data-close-modal>Close</button>`;
    if (p.status === 'pending_verification') {
      foot = `
        <button type="button" class="admin-btn-primary" id="btn-verify-modal">Verify payment</button>
        <button type="button" class="admin-btn-sm danger" id="btn-reject-modal">Reject</button>
        <button type="button" class="admin-btn-ghost" data-close-modal>Close</button>
      `;
    }

    openModal('Payment proof', body, foot);
    modalFoot.querySelector('[data-close-modal]')?.addEventListener('click', closeModal);

    modalFoot.querySelector('#btn-verify-modal')?.addEventListener('click', async () => {
      try {
        await api(`/api/admin/payments/${id}/verify`, { method: 'POST', body: '{}' });
        setBanner('Payment verified.', 'ok');
        closeModal();
        loadPayments();
      } catch (err) {
        setBanner(err.message, 'error');
      }
    });
    modalFoot.querySelector('#btn-reject-modal')?.addEventListener('click', async () => {
      const reason = window.prompt('Rejection reason (min 3 characters):', 'Invalid proof');
      if (!reason || reason.trim().length < 3) return;
      try {
        await api(`/api/admin/payments/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason.trim() }),
        });
        setBanner('Payment rejected.', 'ok');
        closeModal();
        loadPayments();
      } catch (err) {
        setBanner(err.message, 'error');
      }
    });
  } catch (err) {
    openModal('Payment proof', `<p class="admin-error">${escapeHtml(err.message)}</p>`, '');
  }
}

/* ── Search debouncers ─────────────────────────────────────────────────── */
let searchTimer;
function debounce(fn) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(fn, 300);
}

document.getElementById('teams-search')?.addEventListener('input', () => debounce(loadTeams));
document.getElementById('participants-search')?.addEventListener('input', () => debounce(loadParticipants));
document.getElementById('payments-status')?.addEventListener('change', loadPayments);
document.getElementById('payments-search')?.addEventListener('input', () => debounce(loadPayments));
document.getElementById('regs-search')?.addEventListener('input', () => debounce(loadRegistrations));
document.getElementById('regs-status')?.addEventListener('change', loadRegistrations);

trySession();
