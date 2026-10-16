# CarBazaar Local – Used Car Buy & Sell App (MVP)

This is a working MVP of the **Local Used Car Buy & Sell App – A to Z Plan**. It is a mobile-first web app with one Node.js backend. It has four parts: the buyer app, the seller app, the inspector app and the admin panel.

It needs only **Node.js 22.13 or newer**. There are no npm packages to install. The database is SQLite, using Node's built-in `node:sqlite`.

```bash
npm start          # http://localhost:3000
npm test           # API + valuation tests
```

Data is saved to `data/` (database plus uploaded photos). To use another folder, set `DATA_DIR=/path`. To use another port, set `PORT=8080`.

## Demo logins (OTP is shown on screen in dev mode)

| Role      | Mobile     |
|-----------|------------|
| Admin     | 9999999999 |
| Inspector | 8888888888 |
| Seller    | 7777777777 (owns the 6 sample cars) |
| Any new number | becomes a customer (can buy and sell) |

## What is built (maps to the plan)

| Plan section | In the app |
|---|---|
| Buyer | Search, plus filters for brand, model, budget, year, km, fuel, gearbox and owners. Car page with photos, specs, inspection report and EMI calculator. Wishlist, compare up to 3 cars, WhatsApp share and enquiry. Test drive booking (at the yard or at home). Token booking of ₹1,000–₹5,000, refundable on cancel. |
| Seller | Car number and details form. Instant price estimate range. Photo upload (resized in the browser). Asking price. Choice of marketplace or instant sell. Free inspection slot booking. "My listings" page with status, inspection, leads and bookings. |
| Inspector | Job list with seller call link and map link. A 45-point checklist in 9 groups (Good/Fair/Poor plus notes). Accident and RC-verified flags. The app works out the score and grade (A/B/C) automatically and re-prices the car after inspection. |
| Admin | Dashboard with leads, sales, escrow and fee revenue. Approve, reject or feature listings. Assign inspectors. Confirm or cancel test drives and refund tokens. Mark a car sold (commission of 1.5%). RC transfer tracker: filing it releases escrow and pays the seller. Users list. |
| User flows | Buyer money stays in escrow until the RC transfer is filed. Cancelling a token refunds it. |
| Database | Tables follow plan §7: `users`, `cars`, `listings`, `car_photos`, `inspections`, `inspection_items`, `price_estimates`, `leads`, `bookings`, `payments`, `documents`, `rc_transfers`, plus `wishlist`, `sessions` and `otps`. |
| Valuation (§8) | `Price = Base × (1 − Age dep.) × KM × Owner × Condition × Local demand`. Base prices are in `server/catalog.js`; tune them locally. |
| Language | English, ગુજરાતી and हिन्दी switcher. |

## Project layout

```
server/
  server.js      start-up (port, data folder)
  app.js         HTTP API + static files
  db.js          SQLite schema + demo seed data
  valuation.js   price formula
  catalog.js     brands/models with base prices
  checklist.js   inspection checklist + grading
public/          single-page app (index.html, app.js, styles.css, i18n.js)
test/            node:test suites
```

## Before going live (not in this MVP)

- **OTP:** send OTPs through MSG91 or Gupshup in the `/api/auth/otp` handler. Run with `NODE_ENV=production` so OTPs are no longer shown on screen.
- **Payments:** token and full payments are mocked. Replace them with Razorpay or Cashfree orders plus a webhook in the `/token` and `/sold` handlers.
- **Car number auto-fill:** connect a vehicle data (Vahan) API to the sell form.
- **Photos:** move uploads to S3 or Cloudflare R2 with a CDN.
- **Support number:** set `SUPPORT_PHONE=91XXXXXXXXXX` so WhatsApp and Call buttons reach your team.
- **Later phases:** dealer accounts and bulk upload, loan and insurance partners, and native Flutter apps. The Flutter apps can use this same API.
