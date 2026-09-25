/**
 * Farlands frontend config — Google Apps Script backend
 *
 * 1. Deploy google-apps-script/Code.gs as a Web App
 * 2. Paste the Web App URL below
 * 3. Rebuild / hard refresh the site
 */
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw4L0apCSSW8WSH768cuz2hIQ62PjkcJpBBeTxDnlgT_Sl-l31Fn4z6YBCOln8Al6ix/exec';

/** Same value as ADMIN_SECRET in Code.gs — only used on admin.html */
export const ADMIN_SECRET = 'Farlands_Admin_2026';

export async function sheetsApi(payload) {
  if (!APPS_SCRIPT_URL) {
    throw new Error(
      'APPS_SCRIPT_URL is not set. Open src/config.js and paste your Google Apps Script Web App URL.'
    );
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // text/plain avoids CORS preflight issues with Apps Script
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    throw new Error('Invalid response from Google Apps Script.');
  }
  if (!data || data.success === false) {
    throw new Error((data && data.error) || 'Request failed.');
  }
  return data;
}
