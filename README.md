# CampMart

Run with Node.js 22 or newer:

```sh
npm install
npm start
```

Open `http://localhost:3001`. On PowerShell systems that block `npm.ps1`, use
`npm.cmd start` and `npm.cmd test`. `node server.js` also still works.

## Existing workflows

- Scan products or purchase a coupon through the item scanner. Product quantity
  controls respect available stock; each coupon is purchased with quantity one.
- Use Coupon scans an activated coupon and applies its full value. The nett total
  bottoms out at zero. Clear Cart removes the cart and its applied coupon.
- Both Cash and TNG checkout save when **I've Paid** is pressed. **Done** clears
  the completed cart and refreshes the catalog.
- Coupon purchases activate the coupon. Redemption deactivates it, and a used
  coupon can be purchased again, as in the existing application.
- Admin transaction totals retain gross sales and subtract coupon discounts from
  profit. Existing JSON formats and page HTML, CSS, and assets are retained.

## Implementation and configuration

- `server.js` handles routes, validation, and sessions. `createApp()` supports
  isolated test servers without starting the regular server on import.
- `lib/json-store.js` queues file operations and replaces each JSON file through
  a temporary file. Checkout writes inventory, coupons, and transactions once
  each and attempts to restore earlier files if a later write fails.
- Run **one server process per data directory**. The queue coordinates requests
  within that process. Multiple file replacements are not a crash-safe database
  transaction: a power/process failure or failed rollback can leave files out of
  sync.
- Data files are located relative to `server.js`, independent of the directory
  used to launch Node. `PORT` optionally overrides port 3001.
- `SESSION_SECRET` optionally provides a signing secret; otherwise startup
  generates one. Sessions continue to use memory and end on server restart.
- Inventory/coupon mutations and transaction history require the existing admin
  login. The shop can still read inventory/coupons and perform checkout publicly.
- Shared browser helpers in `public/api.mjs` check requests and escape displayed
  text. `public/barcode-scanner.mjs` manages cameras, decoding, and scan audio.
- Invalid input, duplicate coupon purchases, and redemption of an inactive
  coupon are rejected before saving. Prices and discounts come from saved data.
  Failed requests preserve the current form/cart; buttons prevent overlapping
  submissions.

## Verification

```sh
npm test
```

The tests use Node's built-in runner and temporary data directories. They do not
change the shop's data. Coverage includes coupon purchase/redemption/repurchase,
Cash and TNG payment timing, existing sales/profit calculations, concurrent
requests, write failures, admin operations, and simulated camera lifecycle.

Browser-script tests use simulated DOM events and cameras. Real browser rendering
and physical barcode recognition still need a device check. Camera access needs
HTTPS or localhost, camera permission, and access to the existing ZXing CDN.
