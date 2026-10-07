# UAT checklist

Before replacing the old dashboard, verify these cases in the live V3 site.

## Core logic

- Sheet-1 inactive hospital does not appear when **Active hospitals only** is checked.
- Hospital with insurer = No does not appear for that insurer.
- Hospital with TPA = No does not appear for that TPA.
- In-House / Self works without a Sheet-1 TPA column.
- ASP-only hospital never appears as a recommendation.
- Gurgaon and Gurugram resolve to the same city group.
- MAX Bupa historical rows correctly support current Niva Bupa evidence.

## Economics

- Gynaecomastia / ICICI / In-House at Mayom shows historical evidence and Last Exact Match date.
- Target variance is calculated from median bill (or estimated base bill when reliable component separation is available).
- Bill-vs-approval deduction % and ₹ gap are visible.
- Hospitals with >=20% median deduction are visually highlighted.
- Top 5 export contains the same hospitals shown on screen.

## Procedure-specific

- Hernia shows mesh/tacker note.
- SCOLA is detected from Discharge Remarks, not only Procedure.
- Varicose bilateral excludes VenaSeal cases.
- VenaSeal bilateral and unilateral are separated using laterality text where available.

## Distance / map

- Enter 122002 and verify map/distance values render.
- 10 km / 25 km / 50 km radius changes eligible options.
- Missing pincode coordinates do not break recommendation logic.

## Current restrictions

- Procedure/insurer-specific hold comments are highlighted.
- Strong matching holds are excluded by default.
- Turning on **Include hospitals with matching hold/restriction** makes them visible for manual review.
- Nuanced exception comments remain visible to the KYP team.
