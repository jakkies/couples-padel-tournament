# Claim your spot: backend setup

The "Claim your spot" wheel saves claims in a Google Sheet and sends the
confirmation emails through a free Google Apps Script. It takes about
10 minutes to set up once.

## 1. Create the sheet and script

1. Go to [sheets.new](https://sheets.new) and name the sheet, for example
   "Couples Padel Claims".
2. In the sheet, open **Extensions → Apps Script**.
3. Delete the starter code, paste in everything from `Code.gs` in this
   folder, and click **Save**.
4. Choose `setup` in the function drop-down and click **Run**. Google asks
   you to allow access to the sheet and to send email as you. Click
   **Advanced → Go to project (unsafe)** if that warning appears. It's your
   own script, so this is expected.
   A **Claims** tab appears in the sheet.

## 2. Deploy it as a web app

1. Click **Deploy → New deployment**.
2. Click the cog next to "Select type" and choose **Web app**.
3. Set **Execute as** to **Me** and **Who has access** to **Anyone**.
4. Click **Deploy** and copy the **Web app URL**. It ends in `/exec`.

## 3. Connect the website

Paste the URL into `js/claim-config.js`:

```js
window.CLAIM_SPOT_CONFIG = {
  endpoint: "https://script.google.com/macros/s/XXXX/exec",
  totalSpots: 16
};
```

Commit and push. The button changes from "Registration opening soon" to
"Claim your spot".

## How it works

- **Random numbers on the server:** the script picks each number from the
  spots still open, so nobody can pick or refresh for a favourite number.
  A lock stops two couples from getting the same number at the same moment.
- **One spot per couple:** a claim is refused if the representative email,
  the cell number or the same two names (in either order) are already in
  the sheet. That person is shown their existing number instead.
- **Emails:** both the representative and `jakkies@gmail.com` get an email.
  The **Email status** column shows "Sent" or why it failed. A free Gmail
  account can send about 100 emails a day, which is plenty for 16 couples.
- **Privacy:** the website only ever receives team numbers and names.
  Emails and cell numbers stay in the sheet.

## Managing claims

- **Remove a claim:** delete that row in the **Claims** tab. The number
  opens up again straight away.
- **Fix a typo in a name:** edit the cell in the sheet. The website picks
  it up within a minute.
- **Change the organiser email or event details:** edit the constants at
  the top of `Code.gs`, then use **Deploy → Manage deployments → Edit →
  Version: New version → Deploy**. That keeps the same URL.

## Testing locally

While `endpoint` is empty, the button runs in **demo mode** on
`localhost`. Claims are saved only in that browser and no emails are sent.
To clear demo claims, run this in the browser console:
`localStorage.removeItem('couplesPadelDemoClaims'); localStorage.removeItem('couplesPadelClaim')`.
