/**
 * Couples Padel Tournament: "Claim your spot" backend.
 *
 * Paste this into Extensions > Apps Script of the Google Sheet that should
 * hold the claims, run `setup` once, then deploy it as a web app
 * (Execute as: Me, Who has access: Anyone). See README.md in this folder.
 */

const ORGANISER_EMAIL = 'jakkies@gmail.com';
const TOTAL_SPOTS = 16;
const SHEET_NAME = 'Claims';
const EVENT = {
  name: 'Laeveld Agrochem Couples Padel Tournament',
  date: '14 November 2026',
  venue: 'Ruimsig Country Club',
  dressCode: 'Dress your best as a tennis player (there will be a prize)',
  rules: ['Couples need to play together', 'Knock-out rounds', 'A draw will take place for playing spots']
};
const HEADERS = ['Claimed at', 'Number', 'Player 1', 'Player 2', 'Representative email', 'Representative cell', 'Email status'];

/** Run once from the Apps Script editor to create the Claims sheet and grant permissions. */
function setup() {
  getSheet_();
  MailApp.getRemainingDailyQuota();
}

function doGet() {
  return json_({ ok: true, total: TOTAL_SPOTS, claims: publicClaims_(readClaims_(getSheet_())) });
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, code: 'invalid', message: 'We could not read your details. Please try again.' });
  }

  // Hidden honeypot field: real people never fill it in.
  if (data.website) return json_({ ok: false, code: 'invalid', message: 'Your submission could not be accepted.' });

  const player1 = cleanName_(data.player1);
  const player2 = cleanName_(data.player2);
  const email = String(data.email || '').trim().toLowerCase();
  const cell = normaliseCell_(data.cell);

  const problem = validate_(player1, player2, email, cell);
  if (problem) return json_({ ok: false, code: 'invalid', message: problem });

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return json_({ ok: false, code: 'busy', message: 'Lots of couples are claiming spots right now. Please spin again in a moment.' });
  }

  let number;
  let row;
  let claims;
  try {
    const sheet = getSheet_();
    claims = readClaims_(sheet);

    const key = pairKey_(player1, player2);
    const existing = claims.find(c => c.email === email || c.cell === cell || pairKey_(c.player1, c.player2) === key);
    if (existing) {
      return json_({
        ok: false,
        code: 'duplicate',
        number: existing.number,
        player1: existing.player1,
        player2: existing.player2,
        message: 'This couple, email address or cell number has already claimed spot #' + existing.number + '.',
        claims: publicClaims_(claims)
      });
    }

    const taken = new Set(claims.map(c => c.number));
    const open = [];
    for (let n = 1; n <= TOTAL_SPOTS; n++) if (!taken.has(n)) open.push(n);
    if (!open.length) {
      return json_({ ok: false, code: 'full', message: 'All ' + TOTAL_SPOTS + ' spots have been claimed.', claims: publicClaims_(claims) });
    }

    number = open[Math.floor(Math.random() * open.length)];
    // Leading apostrophe keeps the cell number as text so the 0 is not dropped.
    sheet.appendRow([new Date(), number, player1, player2, email, "'" + cell, 'Sending']);
    row = sheet.getLastRow();
    SpreadsheetApp.flush();
    claims.push({ number: number, player1: player1, player2: player2, email: email, cell: cell });
  } finally {
    lock.releaseLock();
  }

  let emailStatus = 'Sent';
  try {
    sendEmails_({ number: number, player1: player1, player2: player2, email: email, cell: cell }, TOTAL_SPOTS - claims.length);
  } catch (err) {
    emailStatus = 'Failed: ' + err.message;
  }
  getSheet_().getRange(row, 7).setValue(emailStatus);

  return json_({
    ok: true,
    number: number,
    player1: player1,
    player2: player2,
    emailSent: emailStatus === 'Sent',
    claims: publicClaims_(claims)
  });
}

function validate_(player1, player2, email, cell) {
  if (player1.length < 2 || player2.length < 2) return 'Please enter both players’ names.';
  if (player1.toLowerCase() === player2.toLowerCase()) return 'Please enter two different names.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Please enter a valid email address.';
  if (!/^\d{9,15}$/.test(cell)) return 'Please enter a valid cell number.';
  return '';
}

function sendEmails_(claim, spotsLeft) {
  const names = claim.player1 + ' & ' + claim.player2;
  const rules = EVENT.rules.map(r => '<li>' + escape_(r) + '</li>').join('');

  MailApp.sendEmail({
    to: claim.email,
    replyTo: ORGANISER_EMAIL,
    name: 'Couples Padel Tournament',
    subject: 'Spot confirmed: Team #' + claim.number + ' · ' + EVENT.name,
    body: [
      'Hi ' + names + ',',
      '',
      'Your spot is confirmed. Your team number is #' + claim.number + '.',
      '',
      'Date: ' + EVENT.date,
      'Venue: ' + EVENT.venue,
      'Dress code: ' + EVENT.dressCode,
      '',
      'General rules:',
      EVENT.rules.map((r, i) => (i + 1) + '. ' + r).join('\n'),
      '',
      'Questions? Just reply to this email.',
      '',
      'See you on court!'
    ].join('\n'),
    htmlBody:
      '<div style="font-family:Georgia,serif;color:#13301f;max-width:520px">' +
      '<p style="letter-spacing:.2em;text-transform:uppercase;color:#9a8434;font-size:12px">' + escape_(EVENT.name) + '</p>' +
      '<h1 style="margin:0 0 8px;font-size:28px">You’re in, ' + escape_(names) + '!</h1>' +
      '<p style="font-size:16px">Your spot is confirmed. Your team number is</p>' +
      '<p style="font-size:56px;font-weight:bold;color:#9a8434;margin:0">#' + claim.number + '</p>' +
      '<table style="margin:18px 0;font-size:15px;border-collapse:collapse">' +
      '<tr><td style="padding:4px 14px 4px 0;font-weight:bold">Date</td><td>' + escape_(EVENT.date) + '</td></tr>' +
      '<tr><td style="padding:4px 14px 4px 0;font-weight:bold">Venue</td><td>' + escape_(EVENT.venue) + '</td></tr>' +
      '<tr><td style="padding:4px 14px 4px 0;font-weight:bold">Dress code</td><td>' + escape_(EVENT.dressCode) + '</td></tr>' +
      '</table>' +
      '<p style="font-weight:bold;margin-bottom:4px">General rules</p><ol style="margin-top:0">' + rules + '</ol>' +
      '<p>Questions? Just reply to this email.</p><p>See you on court!</p></div>'
  });

  MailApp.sendEmail({
    to: ORGANISER_EMAIL,
    replyTo: claim.email,
    name: 'Couples Padel Tournament',
    subject: 'New team: #' + claim.number + ' ' + names,
    body: [
      'A new couple has claimed a spot.',
      '',
      'Team number: #' + claim.number,
      'Players: ' + names,
      'Representative email: ' + claim.email,
      'Representative cell: ' + claim.cell,
      '',
      'Spots still open: ' + spotsLeft + ' of ' + TOTAL_SPOTS
    ].join('\n')
  });
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold');
  }
  return sheet;
}

function readClaims_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .filter(r => Number(r[1]) >= 1 && Number(r[1]) <= TOTAL_SPOTS)
    .map(r => ({
      number: Number(r[1]),
      player1: String(r[2]),
      player2: String(r[3]),
      email: String(r[4]).trim().toLowerCase(),
      cell: normaliseCell_(r[5])
    }));
}

/** Only numbers and names are ever sent to the website; emails and cells stay in the sheet. */
function publicClaims_(claims) {
  return claims
    .map(c => ({ number: c.number, player1: c.player1, player2: c.player2 }))
    .sort((a, b) => a.number - b.number);
}

function cleanName_(value) {
  return String(value || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function normaliseCell_(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.indexOf('27') === 0) digits = '0' + digits.slice(2);
  return digits;
}

function pairKey_(a, b) {
  return [a, b].map(n => String(n).toLowerCase().replace(/\s+/g, ' ').trim()).sort().join('|');
}

function escape_(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
