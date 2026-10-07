# Hexa Network Intelligence V3

A static GitHub Pages dashboard for the KYP team to choose 4–5 suitable partner hospitals **after KYP is already completed in CRM**.

## What this version does

- Treats **Sheet 1 — Hospital network** as the master list of hospitals working with Hexa.
- Requires current insurer/TPA empanelment before a hospital can be recommended.
- Filters to active hospitals by default.
- Uses ASP history to rank hospitals by:
  - target bill fit,
  - approval realization,
  - historical sample size,
  - recency,
  - bill-vs-approval deduction risk,
  - approximate distance from patient pincode.
- Shows both **Last Exact Match Case** (same procedure + insurer + TPA) and **Last Procedure Case**.
- Highlights current Insurance / City / Doctor comments and matching holds/restrictions.
- Highlights hospitals with major historical deductions.
- Shows a map and approximate pincode-centroid distance.
- Exports the top 5 recommendations as CSV.

## Business targets

Edit `targets.js` to change targets without editing the ranking engine.

Current targets:

- Sleeve Bariatric — ₹5,00,000
- Tummy Tuck — ₹4,00,000
- Piles — ₹80,000
- Gynaecomastia — ₹80,000
- Circumcision — ₹40,000
- Hernia — ₹1,20,000 base; mesh/tacker reviewed separately
- SCOLA — ₹2,50,000 base; mesh/tacker to hospital separately
- Varicose Veins bilateral — ₹1,00,000 base; laser separately
- VenaSeal unilateral — ₹2,50,000
- VenaSeal bilateral — ₹5,00,000

## Files to upload to the new GitHub repository

- `index.html`
- `styles.css`
- `app.js`
- `config.js`
- `targets.js`

The current build temporarily loads the comprehensive pincode coordinate dictionary from the existing dashboard:

`https://vikasmatto-ops.github.io/Hexa-KYP-Dashboard-/pincodes.js?v=36`

The old repository should therefore remain live during initial testing. Later, copy `pincodes.js` into this repository and change the script tag in `index.html` to `./pincodes.js` to make the new site fully independent.

## GitHub Pages deployment

1. Create a new public repository, e.g. `Hexa-Network-Intelligence`.
2. Upload the files above to the root of the repository.
3. Commit the files.
4. Go to **Settings → Pages**.
5. Under **Build and deployment**, choose **Deploy from a branch**.
6. Branch: `main`; folder: `/ (root)`.
7. Save and wait for the Pages URL to appear.

## Data sources

`config.js` points to the already-published Google Sheet CSV feeds used by the existing dashboard:

- Hospital network (Sheet 1)
- ASP Data (Sheet 2)

The application refreshes every 10 minutes and also has a manual Refresh button.

## Important data logic

Historical cases that cannot be conservatively matched back to a Sheet-1 partner hospital are counted under **Unmatched ASP Names** but are never recommended as partner options.

For sparse history, evidence is explicitly labelled:

1. Exact insurer + TPA
2. Insurer match / TPA fallback
3. Procedure-only history
4. No procedure history

No fallback is hidden from the user.

## Privacy note

GitHub Pages is public. Browser-loaded Google Sheet data and operational comments should be treated as publicly retrievable by anyone who knows the site/data URLs. For confidential production use, move the data behind an authenticated backend rather than relying on a public static site.
