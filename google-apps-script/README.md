# Farlands → Google Sheets + Apps Script

This replaces Supabase for registration, payment status, and admin approve/reject.

## 1. Create the spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) → blank spreadsheet  
2. Name it **Farlands Registrations**

## 2. Install the script

1. **Extensions → Apps Script**
2. Delete any stub code; paste everything from `Code.gs`
3. Edit at the top:
   ```js
   const ADMIN_SECRET = 'pick-a-long-random-secret';
   const FEE_RUPEES = 1500;
   ```
4. Save
5. Select function **`setupSheets`** → Run → Approve permissions
6. Confirm sheets **Teams**, **Participants**, **Payments** exist

## 3. Deploy as Web App

1. **Deploy → New deployment**
2. Type: **Web app**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Deploy → copy the **Web app URL**

## 4. Wire the website

In `src/config.js`:

```js
export const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/XXXX/exec';
export const ADMIN_SECRET = 'same-secret-as-in-Code.gs';
```

Rebuild / refresh the site.

## 5. How data is stored

| Sheet | Contents |
|-------|----------|
| **Teams** | Team ID, name, fee, payment status, UTR, screenshot URL |
| **Participants** | Each member: role, name, email, phone |
| **Payments** | Payment submissions + review status |

## 6. Admin

Open `/admin.html` → enter the **ADMIN_SECRET** (simple gate) → list teams → Approve / Reject.

## Notes

- Screenshots: the simplified payment form accepts a **public image URL** (e.g. upload to Drive → “Anyone with link” → paste URL), or leave blank and verify by UTR only.
- No Supabase / Node API required for registration once `APPS_SCRIPT_URL` is set.
- To fully drop the old server, deploy only the Vite static `dist/` (Vercel/Netlify is fine).
