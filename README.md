# Hexa Network Intelligence — Cura 2026 history fix

Files to replace: `app.js` only (repo root). Keep `config.js`, `index.html`, `targets.js`, `styles.css` unchanged.

## What's fixed
- Recognizes `Cura Hospital Kamanahalli` in the current hospital network as the same facility as `Cura Multispeciality Hospital, Kammanahalli, Bangalore` in the ASP Data sheet.
- Keeps `Cura Hospital, Kanakapura Rd, Bangalore` as a *different hospital*. History is not merged across branches.
- Hospital detail panel explicitly shows linked historical case counts by year, and exact selected-combination case counts by year, so 2026 data can be verified without mistaking other insurers/procedures for an exact match.

## Verified source facts (as of Nov 18, 2026)
- ASP Data contains 16,296 cases: 3,138 dated 2024, 6,144 dated 2025, 7,014 dated 2026.
- Cura Kanakapura: 66 cases dated 2026; latest case Oct 30, 2026.
- Cura Kammanahalli: 120 cases dated 2026; latest case Nov 1, 2026.
- Counts across all insurers, TPAs and procedures. An exact procedure + insurer + TPA combination can legitimately have fewer or zero cases.
- Historical evidence is separate from current network eligibility. Never infer cashless eligibility from case history.

## How to install
1. Make a backup of the current `app.js` in your `vikasmatto-ops/Hexa-Network-Intelligence` GitHub repository.
2. Replace repo-root `app.js` with the `app.js` provided here.
3. Commit, wait for GitHub Pages deployment, then hard-refresh Ctrl+Shift+R.
4. Select Bangalore and a relevant case, then select Cura Kammanahalli via Hospital Name. Open hospital detail and look under `Decision evidence` for the per-year counts.

## Verification
- Existing GitHub app.js SHA: 9c361f5b70fc89bea5dafefdfbfe43e4d18331dc
- JavaScript `node --check` passed.
- Targeted tests passed for Cura aliases, distinct branches, 2026 date parsing and case linking.
- Browser functionality not live-tested. No repository push was performed.
