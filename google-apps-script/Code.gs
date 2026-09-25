/**
 * Farlands Hackathon — Google Apps Script backend
 * Replaces Supabase for registration, payments, and simple admin actions.
 *
 * SETUP
 * 1. Create a Google Sheet.
 * 2. Extensions → Apps Script → paste this file.
 * 3. Run setupSheets() once (authorize).
 * 4. Deploy → New deployment → Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web App URL into src/config.js (APPS_SCRIPT_URL).
 * 6. Set ADMIN_SECRET below to a long random string; use the same in admin.html.
 */

// ─── CONFIG (edit these) ──────────────────────────────────────────────────────
const ADMIN_SECRET = 'Farlands_Admin_2026';
const FEE_RUPEES = 1500;
const FEE_LABEL = '₹1,500';

// Sheet names
const SHEET_TEAMS = 'Teams';
const SHEET_PARTICIPANTS = 'Participants';
const SHEET_PAYMENTS = 'Payments';

// ─── HTTP entry points ────────────────────────────────────────────────────────
function doGet(e) {
  return json_({ ok: true, service: 'Farlands Apps Script', version: 1 });
}

function doPost(e) {
  try {
    const body = parseBody_(e);
    const action = String(body.action || 'register').toLowerCase();

    if (action === 'register') return handleRegister_(body);
    if (action === 'complete_registration') return handleCompleteRegistration_(body);
    if (action === 'submit_payment') return handleSubmitPayment_(body);
    if (action === 'list') return handleList_(body);
    if (action === 'set_payment_status') return handleSetPaymentStatus_(body);
    if (action === 'get_team') return handleGetTeam_(body);

    return json_({ success: false, error: 'Unknown action: ' + action }, 400);
  } catch (err) {
    return json_({ success: false, error: err.message || String(err) }, 500);
  }
}

// ─── One-time setup ───────────────────────────────────────────────────────────
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheet_(ss, SHEET_TEAMS, [
    'Timestamp', 'Team ID', 'Team Name', 'Reg Number', 'Fee', 'Payment Status',
    'UTR', 'Screenshot URL', 'Member Count', 'Status'
  ]);
  ensureSheet_(ss, SHEET_PARTICIPANTS, [
    'Timestamp', 'Team ID', 'Role', 'Name', 'Email', 'Phone'
  ]);
  ensureSheet_(ss, SHEET_PAYMENTS, [
    'Timestamp', 'Team ID', 'Team Name', 'UTR', 'Screenshot URL', 'Status', 'Reviewed At', 'Rejection Reason'
  ]);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const existing = sh.getRange(1, 1, 1, headers.length).getValues()[0];
  const blank = existing.every(function (c) { return c === ''; });
  if (blank) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.setFrozenRows(1);
  }
}

// ─── Actions ──────────────────────────────────────────────────────────────────
function handleRegisterCore_(body) {
  var teamName = String(body.teamName || '').trim();
  var teammates = Array.isArray(body.teammates) ? body.teammates : [];

  if (!teamName) throw new Error('Team name is required.');
  if (teammates.length < 2 || teammates.length > 4) {
    throw new Error('Teams must have 2 to 4 members.');
  }

  for (var i = 0; i < teammates.length; i++) {
    var m = teammates[i] || {};
    if (!String(m.name || '').trim()) throw new Error('Member ' + (i + 1) + ': name is required.');
    if (!String(m.email || '').trim()) throw new Error('Member ' + (i + 1) + ': email is required.');
    if (!isEmail_(m.email)) throw new Error('Member ' + (i + 1) + ': invalid email.');
    var phone = String(m.phone || '').replace(/[\s-]/g, '');
    if (!phone || !/^\+?[0-9]{10,15}$/.test(phone)) {
      throw new Error('Member ' + (i + 1) + ': valid phone is required.');
    }
  }

  var emails = teammates.map(function (tm) { return String(tm.email).trim().toLowerCase(); });
  if (new Set(emails).size !== emails.length) {
    throw new Error('Each teammate must use a different email.');
  }
  var existing = findEmails_(emails);
  if (existing.length) {
    throw new Error('Email already registered: ' + existing.join(', '));
  }

  var teamId = generateTeamId_();
  var regNumber = 'REG-2026-' + teamId;
  var now = new Date();

  sheet_(SHEET_TEAMS).appendRow([
    now, teamId, teamName, regNumber, FEE_RUPEES, 'pending_payment',
    '', '', teammates.length, 'active'
  ]);

  var parts = sheet_(SHEET_PARTICIPANTS);
  for (var j = 0; j < teammates.length; j++) {
    var tm = teammates[j];
    parts.appendRow([
      now,
      teamId,
      j === 0 ? 'leader' : 'member',
      String(tm.name).trim(),
      String(tm.email).trim().toLowerCase(),
      String(tm.phone).trim()
    ]);
  }

  return { teamId: teamId, teamName: teamName, regNumber: regNumber, teammates: teammates };
}

function handleRegister_(body) {
  var core = handleRegisterCore_(body);
  return json_({
    success: true,
    team: {
      teamId: core.teamId,
      teamName: core.teamName,
      name: core.teamName
    },
    registration: {
      registrationNumber: core.regNumber,
      teamId: core.teamId,
      status: 'pending_payment',
      feeAmount: FEE_RUPEES * 100,
      currency: 'INR',
      feeLabel: FEE_LABEL
    },
    participants: core.teammates.map(function (tm, idx) {
      return {
        name: String(tm.name).trim(),
        email: String(tm.email).trim().toLowerCase(),
        role: idx === 0 ? 'leader' : 'member'
      };
    })
  });
}



/**
 * Single write: team + participants + payment proof.
 * Called only after UPI proof is submitted from the website.
 */
function handleCompleteRegistration_(body) {
  // 1) Create team + members (reuse validation from register)
  var regResult = handleRegisterCore_(body);
  var teamId = regResult.teamId;
  var teamName = regResult.teamName;
  var regNumber = regResult.regNumber;

  // 2) Payment fields
  var utr = String(body.utr || '').trim().toUpperCase();
  var screenshotUrl = String(body.screenshotUrl || body.screenshot_url || '').trim();
  var screenshotBase64 = String(body.screenshotBase64 || body.screenshot_base64 || '').trim();
  var screenshotName = String(body.screenshotName || 'payment-proof.jpg').trim();
  var screenshotMime = String(body.screenshotMime || 'image/jpeg').trim();

  if (!utr || utr.length < 6) throw new Error('Valid UTR / UPI transaction ID is required.');
  if (!screenshotBase64 && !screenshotUrl) throw new Error('Payment screenshot is required.');

  if (screenshotBase64) {
    var b64 = screenshotBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    if (b64.length < 100) throw new Error('Payment screenshot file is invalid or empty.');
    if (b64.length > 6000000) throw new Error('Screenshot is too large. Use a PNG/JPG under 4 MB.');
    var blob = Utilities.newBlob(Utilities.base64Decode(b64), screenshotMime || 'image/jpeg', screenshotName || (teamId + '-proof.jpg'));
    var folder = getProofsFolder_();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    screenshotUrl = file.getUrl();
  }
  if (!screenshotUrl) throw new Error('Payment screenshot is required.');

  // 3) Update team payment columns
  var teams = sheet_(SHEET_TEAMS);
  var data = teams.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).toUpperCase() === String(teamId).toUpperCase()) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex < 0) throw new Error('Team row missing after create.');

  teams.getRange(rowIndex, 6).setValue('pending_verification');
  teams.getRange(rowIndex, 7).setValue(utr);
  teams.getRange(rowIndex, 8).setValue(screenshotUrl);

  sheet_(SHEET_PAYMENTS).appendRow([
    new Date(), teamId, teamName, utr, screenshotUrl, 'pending_verification', '', ''
  ]);

  return json_({
    success: true,
    team: { teamId: teamId, teamName: teamName, name: teamName },
    registration: {
      registrationNumber: regNumber,
      teamId: teamId,
      status: 'pending_verification',
      feeAmount: FEE_RUPEES * 100,
      currency: 'INR',
      feeLabel: FEE_LABEL
    },
    payment: {
      teamId: teamId,
      utr: utr,
      status: 'pending_verification',
      screenshotUrl: screenshotUrl
    }
  });
}

function handleSubmitPayment_(body) {
  var teamId = String(body.teamId || '').trim().toUpperCase();
  var utr = String(body.utr || '').trim().toUpperCase();
  var screenshotUrl = String(body.screenshotUrl || body.screenshot_url || '').trim();
  var screenshotBase64 = String(body.screenshotBase64 || body.screenshot_base64 || '').trim();
  var screenshotName = String(body.screenshotName || 'payment-proof.jpg').trim();
  var screenshotMime = String(body.screenshotMime || 'image/jpeg').trim();

  if (!teamId) throw new Error('Team ID is required.');
  if (!utr || utr.length < 6) throw new Error('Valid UTR / UPI transaction ID is required.');

  // Screenshot is mandatory: either uploaded base64 or a direct image URL
  if (!screenshotBase64 && !screenshotUrl) {
    throw new Error('Payment screenshot is required.');
  }

  if (screenshotBase64) {
    // Strip data-URL prefix if present
    var b64 = screenshotBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    if (b64.length < 100) throw new Error('Payment screenshot file is invalid or empty.');
    // ~4.5MB base64 safety cap (Apps Script practical limit)
    if (b64.length > 6000000) throw new Error('Screenshot is too large. Use a PNG/JPG under 4 MB.');

    var blob = Utilities.newBlob(Utilities.base64Decode(b64), screenshotMime || 'image/jpeg', screenshotName || (teamId + '-proof.jpg'));
    var folder = getProofsFolder_();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    screenshotUrl = file.getUrl();
  }

  if (!screenshotUrl) throw new Error('Payment screenshot is required.');

  var teams = sheet_(SHEET_TEAMS);
  var data = teams.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).toUpperCase() === teamId) {
      rowIndex = i + 1; // 1-based
      break;
    }
  }
  if (rowIndex < 0) throw new Error('Team ID not found.');

  // Columns: Timestamp(0) TeamID(1) TeamName(2) Reg(3) Fee(4) PayStatus(5) UTR(6) Screenshot(7)
  teams.getRange(rowIndex, 6).setValue('pending_verification');
  teams.getRange(rowIndex, 7).setValue(utr);
  teams.getRange(rowIndex, 8).setValue(screenshotUrl);

  var teamName = data[rowIndex - 1][2];
  var payments = sheet_(SHEET_PAYMENTS);
  payments.appendRow([
    new Date(), teamId, teamName, utr, screenshotUrl, 'pending_verification', '', ''
  ]);

  return json_({
    success: true,
    payment: {
      teamId: teamId,
      utr: utr,
      status: 'pending_verification',
      screenshotUrl: screenshotUrl
    }
  });
}

/** Folder in Drive: "Farlands Payment Proofs" */
function getProofsFolder_() {
  var name = 'Farlands Payment Proofs';
  var it = DriveApp.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(name);
}

function handleList_(body) {
  requireAdmin_(body);
  var teams = sheet_(SHEET_TEAMS).getDataRange().getValues();
  var parts = sheet_(SHEET_PARTICIPANTS).getDataRange().getValues();

  var membersByTeam = {};
  for (var i = 1; i < parts.length; i++) {
    var tid = String(parts[i][1]);
    if (!membersByTeam[tid]) membersByTeam[tid] = [];
    membersByTeam[tid].push({
      role: parts[i][2],
      name: parts[i][3],
      email: parts[i][4],
      phone: parts[i][5]
    });
  }

  var rows = [];
  for (var r = 1; r < teams.length; r++) {
    var t = teams[r];
    var id = String(t[1]);
    rows.push({
      timestamp: t[0],
      teamId: id,
      teamName: t[2],
      registrationNumber: t[3],
      fee: t[4],
      paymentStatus: t[5],
      utr: t[6],
      screenshotUrl: t[7],
      memberCount: t[8],
      status: t[9],
      members: membersByTeam[id] || []
    });
  }

  // newest first
  rows.reverse();
  return json_({ success: true, registrations: rows });
}

function handleSetPaymentStatus_(body) {
  requireAdmin_(body);
  var teamId = String(body.teamId || '').trim().toUpperCase();
  var status = String(body.status || '').trim().toLowerCase(); // verified | rejected
  var reason = String(body.reason || '').trim();

  if (!teamId) throw new Error('Team ID required.');
  if (status !== 'verified' && status !== 'rejected') {
    throw new Error('Status must be verified or rejected.');
  }

  var teams = sheet_(SHEET_TEAMS);
  var data = teams.getDataRange().getValues();
  var rowIndex = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][1]).toUpperCase() === teamId) {
      rowIndex = i + 1;
      break;
    }
  }
  if (rowIndex < 0) throw new Error('Team not found.');

  var sheetStatus = status === 'verified' ? 'verified' : 'rejected';
  teams.getRange(rowIndex, 6).setValue(sheetStatus);

  // Update latest payment row for team
  var payments = sheet_(SHEET_PAYMENTS);
  var pdata = payments.getDataRange().getValues();
  for (var p = pdata.length - 1; p >= 1; p--) {
    if (String(pdata[p][1]).toUpperCase() === teamId) {
      payments.getRange(p + 1, 6).setValue(sheetStatus);
      payments.getRange(p + 1, 7).setValue(new Date());
      if (status === 'rejected') payments.getRange(p + 1, 8).setValue(reason || 'Rejected');
      break;
    }
  }

  return json_({ success: true, teamId: teamId, paymentStatus: sheetStatus });
}

function handleGetTeam_(body) {
  var teamId = String(body.teamId || '').trim().toUpperCase();
  if (!teamId) throw new Error('Team ID required.');

  var teams = sheet_(SHEET_TEAMS).getDataRange().getValues();
  for (var i = 1; i < teams.length; i++) {
    if (String(teams[i][1]).toUpperCase() === teamId) {
      return json_({
        success: true,
        team: {
          teamId: teams[i][1],
          teamName: teams[i][2],
          registrationNumber: teams[i][3],
          fee: teams[i][4],
          paymentStatus: teams[i][5],
          utr: teams[i][6],
          feeLabel: FEE_LABEL
        }
      });
    }
  }
  throw new Error('Team not found.');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function requireAdmin_(body) {
  var secret = String(body.adminSecret || body.secret || '');
  if (!ADMIN_SECRET || ADMIN_SECRET.indexOf('CHANGE_ME') === 0) {
    throw new Error('ADMIN_SECRET is not configured in Apps Script.');
  }
  if (secret !== ADMIN_SECRET) throw new Error('Unauthorized.');
}

function sheet_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) {
    setupSheets();
    sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  }
  if (!sh) throw new Error('Sheet missing: ' + name);
  return sh;
}

function generateTeamId_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var id = 'FL26-';
  for (var i = 0; i < 6; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // ensure unique
  var data = sheet_(SHEET_TEAMS).getDataRange().getValues();
  for (var r = 1; r < data.length; r++) {
    if (String(data[r][1]) === id) return generateTeamId_();
  }
  return id;
}

function findEmails_(emails) {
  var found = [];
  var data = sheet_(SHEET_PARTICIPANTS).getDataRange().getValues();
  var set = {};
  emails.forEach(function (e) { set[e.toLowerCase()] = true; });
  for (var i = 1; i < data.length; i++) {
    var em = String(data[i][4] || '').toLowerCase();
    if (set[em]) found.push(em);
  }
  return found;
}

function isEmail_(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function parseBody_(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      // form-urlencoded fallback
      var out = {};
      if (e.parameter) {
        Object.keys(e.parameter).forEach(function (k) { out[k] = e.parameter[k]; });
      }
      return out;
    }
  }
  return (e && e.parameter) || {};
}

function json_(obj, status) {
  // Apps Script web apps don't fully honor status codes for all clients;
  // include success flag in body.
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
