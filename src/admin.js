/**
 * Farlands Admin — auth-gated master table + CSV export + remove team/participant
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

/** @type {Array<Record<string, any>>} */
let masterRows = [];
let isAuthed = false;

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
  isAuthed = false;
  masterRows = [];
  loginView.hidden = false;
  dashView.hidden = true;
  const tbody = document.getElementById('master-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="muted">Sign in required</td></tr>';
  const cards = document.getElementById('master-cards');
  if (cards) cards.innerHTML = '';
  const grid = document.getElementById('stats-grid');
  if (grid) grid.innerHTML = '<div class="admin-stat"><span class="label">Locked</span><strong>—</strong></div>';
}

function showDash() {
  isAuthed = true;
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

function paymentBadge(status) {
  const s = String(status || 'no_payment').toLowerCase();
  if (s === 'verified' || s === 'paid' || s === 'confirmed') {
    return `<span class="badge badge-ok">Verified</span>`;
  }
  if (s === 'pending' || s === 'pending_verification' || s === 'payment_processing') {
    return `<span class="badge badge-warn">Pending verification</span>`;
  }
  if (s === 'rejected' || s === 'payment_failed') {
    return `<span class="badge badge-err">Rejected</span>`;
  }
  return `<span class="badge badge-muted">No proof yet</span>`;
}

function normalizePaymentStatus(p) {
  if (!p) return 'no_payment';
  const s = String(p.status || '').toLowerCase();
  if (['verified', 'paid', 'confirmed'].includes(s)) return 'verified';
  if (['pending', 'pending_verification', 'payment_processing'].includes(s)) return 'pending';
  if (['rejected', 'payment_failed'].includes(s)) return 'rejected';
  return s || 'no_payment';
}

function openModal(title, bodyHtml, footHtml = '') {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modalFoot.innerHTML = footHtml;
  modal.hidden = false;
}
function closeModal() {
  modal.hidden = true;
  modalBody.innerHTML = '';
  modalFoot.innerHTML = '';
}
modal?.querySelectorAll('[data-close-modal]').forEach((el) => {
  el.addEventListener('click', closeModal);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.hidden) closeModal();
});

/* ── Auth ──────────────────────────────────────────────────────────────── */
async function trySession() {
  // Always start locked; only unlock after a successful admin API call
  showLogin();
  try {
    await api('/api/admin/stats');
    showDash();
    await refreshAll();
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
      showLogin();
      return;
    }
    showDash();
    setBanner('Signed in as admin.', 'ok');
    await refreshAll();
  } catch (err) {
    setLoginError(err.message || 'Sign in failed.');
    showLogin();
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
});

/* ── Data ──────────────────────────────────────────────────────────────── */
async function loadStats() {
  if (!isAuthed) return;
  const grid = document.getElementById('stats-grid');
  try {
    const data = await api('/api/admin/stats');
    const stats = data?.statistics || data?.stats || data || {};
    const items = [
      ['Teams', stats.totalTeams ?? stats.teams ?? 0],
      ['Participants', stats.totalParticipants ?? stats.participants ?? 0],
      ['Registrations', stats.totalRegistrations ?? stats.registrations ?? 0],
      ['Pending payments', stats.pendingPayments ?? stats.paymentsPending ?? 0],
      ['Verified', stats.verifiedPayments ?? stats.paidPayments ?? 0],
    ];
    grid.innerHTML = items
      .map(
        ([label, val]) =>
          `<div class="admin-stat"><span class="label">${escapeHtml(label)}</span><strong>${escapeHtml(String(val ?? '—'))}</strong></div>`
      )
      .join('');
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      showLogin();
      return;
    }
    grid.innerHTML = `<div class="admin-stat"><span class="label">Error</span><strong>!</strong></div>`;
  }
}

async function loadMasterTable() {
  if (!isAuthed) return;
  const tbody = document.getElementById('master-tbody');
  const cards = document.getElementById('master-cards');
  tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
  cards.innerHTML = '';

  try {
    const [regsData, paysData] = await Promise.all([
      api('/api/admin/registrations?pageSize=200'),
      api('/api/admin/payments?pageSize=200').catch(() => ({ payments: [] })),
    ]);

    const payments = paysData?.payments || paysData?.items || [];
    const payByTeam = new Map();
    for (const p of payments) {
      const teamUuid = p.team?.id || p.teamId || p.registration?.teamId || p.team_id;
      const regNum = p.registration?.registrationNumber || p.registrationNumber;
      const key = teamUuid || regNum;
      if (!key) continue;
      const prev = payByTeam.get(key);
      if (!prev || new Date(p.createdAt || p.created_at || 0) > new Date(prev.createdAt || prev.created_at || 0)) {
        payByTeam.set(key, p);
      }
      if (regNum) payByTeam.set(regNum, p);
    }

    const regs = regsData?.registrations || regsData?.items || [];
    masterRows = regs.map((reg) => {
      const team = reg.team || {};
      const members = team.members || team.participants || [];
      const payment =
        payByTeam.get(team.id) ||
        payByTeam.get(reg.registrationNumber) ||
        payByTeam.get(team.teamId) ||
        null;
      return {
        registrationId: reg.id,
        registrationNumber: reg.registrationNumber || reg.registration_number || '—',
        teamUuid: team.id,
        teamId: team.teamId || team.team_id || '—',
        teamName: team.teamName || team.team_name || '—',
        members,
        regStatus: reg.status,
        paymentStatus: normalizePaymentStatus(payment),
        payment,
        utr: payment?.utr || '',
        createdAt: reg.createdAt || reg.created_at,
        feeAmount: reg.feeAmount ?? reg.fee_amount,
      };
    });

    renderMaster();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      showLogin();
      return;
    }
    tbody.innerHTML = `<tr><td colspan="6" class="muted">${escapeHtml(err.message)}</td></tr>`;
  }
}

function filteredRows() {
  const q = (document.getElementById('master-search')?.value || '').trim().toLowerCase();
  const statusFilter = document.getElementById('master-status')?.value || '';
  return masterRows.filter((row) => {
    if (statusFilter && row.paymentStatus !== statusFilter) return false;
    if (!q) return true;
    const hay = [
      row.registrationNumber,
      row.teamName,
      row.teamId,
      row.utr,
      ...row.members.map((m) => `${m.name || ''} ${m.email || ''}`),
    ]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

function renderMaster() {
  if (!isAuthed) {
    showLogin();
    return;
  }
  const rows = filteredRows();
  const tbody = document.getElementById('master-tbody');
  const cards = document.getElementById('master-cards');

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">No registrations found</td></tr>';
    cards.innerHTML = '<p class="muted">No registrations found</p>';
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const membersHtml = row.members.length
        ? `<ul class="members-list">${row.members
            .map(
              (m) =>
                `<li><strong>${escapeHtml(m.name || '—')}</strong><div class="email">${escapeHtml(m.email || '')}</div><div class="email">${escapeHtml(m.phone || '—')}</div></li>`
            )
            .join('')}</ul>`
        : '<span class="muted">—</span>';
      const removeTeam = row.teamUuid
        ? `<button type="button" class="danger" data-del-team="${escapeHtml(row.teamUuid)}" data-team-name="${escapeHtml(row.teamName)}">Remove team</button>`
        : '';
      const removeMembers = row.members
        .map(
          (m) =>
            m.id
              ? `<button type="button" class="danger" data-del-part="${escapeHtml(m.id)}" data-part-name="${escapeHtml(m.name || '')}">Remove ${escapeHtml((m.name || 'member').split(' ')[0])}</button>`
              : ''
        )
        .join('');

      return `<tr>
        <td><code>${escapeHtml(row.registrationNumber)}</code></td>
        <td><strong>${escapeHtml(row.teamName)}</strong><div class="email">${escapeHtml(row.teamId)}</div></td>
        <td>${membersHtml}</td>
        <td>${paymentBadge(row.paymentStatus)}</td>
        <td>${escapeHtml(formatDate(row.createdAt))}</td>
        <td><div class="row-actions">${removeTeam}${removeMembers}</div></td>
      </tr>`;
    })
    .join('');

  cards.innerHTML = rows
    .map((row) => {
      const members = row.members
        .map((m) => `<li>${escapeHtml(m.name || '—')} · ${escapeHtml(m.email || '')} · ${escapeHtml(m.phone || '—')}</li>`)
        .join('');
      return `<article class="master-card">
        <h3>${escapeHtml(row.teamName)}</h3>
        <div class="meta">
          <div>Reg: <code>${escapeHtml(row.registrationNumber)}</code></div>
          <div>Team ID: ${escapeHtml(row.teamId)}</div>
          <div>${paymentBadge(row.paymentStatus)}</div>
          <div>${escapeHtml(formatDate(row.createdAt))}</div>
        </div>
        <ol class="participants">${members || '<li>—</li>'}</ol>
        <div class="row-actions">
          ${row.teamUuid ? `<button type="button" class="danger" data-del-team="${escapeHtml(row.teamUuid)}" data-team-name="${escapeHtml(row.teamName)}">Remove team</button>` : ''}
          ${row.members
            .map((m) =>
              m.id
                ? `<button type="button" class="danger" data-del-part="${escapeHtml(m.id)}" data-part-name="${escapeHtml(m.name || '')}">Remove ${escapeHtml((m.name || 'member').split(' ')[0])}</button>`
                : ''
            )
            .join('')}
        </div>
      </article>`;
    })
    .join('');
}


/** @type {Array<Record<string, any>>} */
let reviewRows = [];

function reviewStatusKey(p) {
  return normalizePaymentStatus(p);
}

async function loadReviewTable() {
  if (!isAuthed) return;
  const tbody = document.getElementById('review-tbody');
  const cards = document.getElementById('review-cards');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="3" class="muted">Loading…</td></tr>';
  if (cards) cards.innerHTML = '';
  try {
    const data = await api('/api/admin/payments?pageSize=200');
    const payments = data?.payments || data?.items || [];
    reviewRows = payments.map((p) => {
      const team = p.team || {};
      return {
        id: p.id,
        teamName: team.teamName || team.team_name || p.teamName || '—',
        teamId: team.teamId || team.team_id || '',
        status: reviewStatusKey(p),
        rawStatus: p.status,
      };
    });
    renderReview();
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      showLogin();
      return;
    }
    tbody.innerHTML = `<tr><td colspan="3" class="muted">${escapeHtml(err.message)}</td></tr>`;
  }
}

function filteredReviewRows() {
  const filter = document.getElementById('review-filter')?.value || 'pending';
  if (filter === 'all') return reviewRows;
  return reviewRows.filter((r) => r.status === filter);
}

function renderReview() {
  if (!isAuthed) return;
  const rows = filteredReviewRows();
  const tbody = document.getElementById('review-tbody');
  const cards = document.getElementById('review-cards');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">No payment submissions in this filter</td></tr>';
    if (cards) cards.innerHTML = '<p class="muted">No payment submissions in this filter</p>';
    return;
  }

  tbody.innerHTML = rows
    .map((row) => {
      const canReview = row.status === 'pending';
      const actions = canReview
        ? `<div class="row-actions">
            <button type="button" class="approve-btn" data-approve="${escapeHtml(row.id)}" data-team="${escapeHtml(row.teamName)}">Approve</button>
            <button type="button" class="danger" data-reject="${escapeHtml(row.id)}" data-team="${escapeHtml(row.teamName)}">Reject</button>
          </div>`
        : `<span class="muted">Already ${escapeHtml(row.status)}</span>`;
      return `<tr>
        <td><strong>${escapeHtml(row.teamName)}</strong>${row.teamId ? `<div class="email">${escapeHtml(row.teamId)}</div>` : ''}</td>
        <td>${paymentBadge(row.status)}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join('');

  if (cards) {
    cards.innerHTML = rows
      .map((row) => {
        const canReview = row.status === 'pending';
        const actions = canReview
          ? `<div class="row-actions">
              <button type="button" class="approve-btn" data-approve="${escapeHtml(row.id)}" data-team="${escapeHtml(row.teamName)}">Approve</button>
              <button type="button" class="danger" data-reject="${escapeHtml(row.id)}" data-team="${escapeHtml(row.teamName)}">Reject</button>
            </div>`
          : `<span class="muted">Already ${escapeHtml(row.status)}</span>`;
        return `<article class="master-card">
          <h3>${escapeHtml(row.teamName)}</h3>
          <div class="meta">${paymentBadge(row.status)}</div>
          ${actions}
        </article>`;
      })
      .join('');
  }
}

async function refreshAll() {
  if (!isAuthed) return;
  await Promise.all([loadStats(), loadMasterTable(), loadReviewTable()]);
}

document.getElementById('master-refresh')?.addEventListener('click', () => refreshAll());
document.getElementById('review-refresh')?.addEventListener('click', () => loadReviewTable());
document.getElementById('review-filter')?.addEventListener('change', () => renderReview());
document.getElementById('master-search')?.addEventListener('input', () => {
  if (isAuthed) renderMaster();
});
document.getElementById('master-status')?.addEventListener('change', () => {
  if (isAuthed) renderMaster();
});

/* ── CSV export ────────────────────────────────────────────────────────── */
document.getElementById('master-export')?.addEventListener('click', () => {
  if (!isAuthed) {
    setBanner('Sign in required to export.', 'error');
    return;
  }
  const rows = filteredRows();
  const headers = [
    'Registration ID',
    'Team Name',
    'Team ID',
    'Participants',
    'Participant Emails',
    'Participant Phones',
    'Payment Status',
    'Created At',
  ];
  const lines = [headers.join(',')];
  for (const row of rows) {
    const names = row.members.map((m) => m.name || '').join('; ');
    const emails = row.members.map((m) => m.email || '').join('; ');
    const phones = row.members.map((m) => m.phone || '').join('; ');
    const cells = [
      row.registrationNumber,
      row.teamName,
      row.teamId,
      names,
      emails,
      phones,
      row.paymentStatus,
      row.createdAt || '',
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`);
    lines.push(cells.join(','));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  // CSV
  const csvBlob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const csvUrl = URL.createObjectURL(csvBlob);
  const csvA = document.createElement('a');
  csvA.href = csvUrl;
  csvA.download = `farlands-registrations-${stamp}.csv`;
  csvA.click();
  URL.revokeObjectURL(csvUrl);
  // Excel-compatible HTML table (.xls)
  const excelRows = rows.map((row) => {
    const names = row.members.map((m) => m.name || '').join('; ');
    const emails = row.members.map((m) => m.email || '').join('; ');
    const phones = row.members.map((m) => m.phone || '').join('; ');
    return [row.registrationNumber, row.teamName, row.teamId, names, emails, phones, row.paymentStatus, row.createdAt || ''];
  });
  const excelHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8" /></head><body><table>${[headers, ...excelRows].map((r) => `<tr>${r.map((c) => `<td>${String(c).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</td>`).join('')}</tr>`).join('')}</table></body></html>`;
  const xlsBlob = new Blob([excelHtml], { type: 'application/vnd.ms-excel' });
  const xlsUrl = URL.createObjectURL(xlsBlob);
  const xlsA = document.createElement('a');
  xlsA.href = xlsUrl;
  xlsA.download = `farlands-registrations-${stamp}.xls`;
  xlsA.click();
  URL.revokeObjectURL(xlsUrl);
  setBanner(`Exported ${rows.length} row(s) as CSV and Excel.`, 'ok');
});

/* ── Actions (event delegation) ────────────────────────────────────────── */
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (!(t instanceof HTMLElement)) return;

  const proofId = t.getAttribute('data-proof');
  if (proofId) {
    e.preventDefault();
    if (!isAuthed) return;
    try {
      const data = await api(`/api/admin/payments/${proofId}`);
      const p = data?.payment || data;
      const url = p?.screenshotUrl || p?.proofUrl || p?.url;
      openModal(
        'Payment proof',
        `<div class="info-grid">
          <div><span class="label">UTR</span><strong><code>${escapeHtml(p?.utr || '—')}</code></strong></div>
          <div><span class="label">Status</span>${paymentBadge(p?.status)}</div>
        </div>
        ${url ? `<img class="proof-img" src="${escapeHtml(url)}" alt="Payment screenshot" />` : '<p class="muted">Screenshot URL not available.</p>'}`,
        `<button type="button" class="admin-btn-sm" data-close-modal>Close</button>
         ${p?.status === 'pending' || p?.status === 'pending_verification' ? `
           <button type="button" class="admin-btn-sm" id="btn-verify-pay" data-id="${escapeHtml(proofId)}">Verify</button>
           <button type="button" class="admin-btn-sm danger" id="btn-reject-pay" data-id="${escapeHtml(proofId)}">Reject</button>
         ` : ''}`
      );
      document.getElementById('btn-verify-pay')?.addEventListener('click', async () => {
        try {
          await api(`/api/admin/payments/${proofId}/verify`, { method: 'POST', body: '{}' });
          setBanner('Payment verified.', 'ok');
          closeModal();
          await refreshAll();
        } catch (err) {
          setBanner(err.message, 'error');
        }
      });
      document.getElementById('btn-reject-pay')?.addEventListener('click', async () => {
        const reason = prompt('Rejection reason?') || 'Invalid proof';
        try {
          await api(`/api/admin/payments/${proofId}/reject`, {
            method: 'POST',
            body: JSON.stringify({ reason }),
          });
          setBanner('Payment rejected.', 'ok');
          closeModal();
          await refreshAll();
        } catch (err) {
          setBanner(err.message, 'error');
        }
      });
    } catch (err) {
      setBanner(err.message, 'error');
    }
    return;
  }


  const approveId = t.getAttribute('data-approve');
  if (approveId) {
    e.preventDefault();
    if (!isAuthed) return;
    const team = t.getAttribute('data-team') || 'this team';
    if (!confirm(`Approve payment for "${team}"?`)) return;
    t.disabled = true;
    try {
      await api(`/api/admin/payments/${approveId}/verify`, { method: 'POST', body: '{}' });
      setBanner(`Approved payment for ${team}.`, 'ok');
      await refreshAll();
    } catch (err) {
      setBanner(err.message, 'error');
    }
    return;
  }

  const rejectId = t.getAttribute('data-reject');
  if (rejectId) {
    e.preventDefault();
    if (!isAuthed) return;
    const team = t.getAttribute('data-team') || 'this team';
    const reason = prompt(`Reject payment for "${team}". Reason:`) || '';
    if (!reason.trim()) {
      setBanner('Rejection reason is required.', 'error');
      return;
    }
    t.disabled = true;
    try {
      await api(`/api/admin/payments/${rejectId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() }),
      });
      setBanner(`Rejected payment for ${team}.`, 'ok');
      await refreshAll();
    } catch (err) {
      setBanner(err.message, 'error');
    }
    return;
  }

  const delTeam = t.getAttribute('data-del-team');
  if (delTeam) {
    e.preventDefault();
    if (!isAuthed) return;
    const name = t.getAttribute('data-team-name') || 'this team';
    if (!confirm(`Remove team "${name}" and all its participants, registration, and payment proofs? This cannot be undone.`)) {
      return;
    }
    try {
      await api(`/api/admin/teams/${delTeam}`, { method: 'DELETE' });
      setBanner('Team removed.', 'ok');
      await refreshAll();
    } catch (err) {
      setBanner(err.message, 'error');
    }
    return;
  }

  const delPart = t.getAttribute('data-del-part');
  if (delPart) {
    e.preventDefault();
    if (!isAuthed) return;
    const name = t.getAttribute('data-part-name') || 'this participant';
    if (!confirm(`Remove participant "${name}"?`)) return;
    try {
      await api(`/api/admin/participants/${delPart}`, { method: 'DELETE' });
      setBanner('Participant removed.', 'ok');
      await refreshAll();
    } catch (err) {
      setBanner(err.message, 'error');
    }
  }
});

// Boot: locked until session proves admin
trySession();
