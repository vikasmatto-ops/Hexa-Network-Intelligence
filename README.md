# Hexa Hospital Planner — V5 Classic Intelligence

Purpose: a focused decision-support tool for the KYP team to choose 4–5 currently eligible partner hospitals after KYP is completed in CRM.

## Core principles
- Sheet 1 / Hospital Network is the partner-hospital source of truth.
- A recommendation is eligible only when the hospital is a Sheet-1 partner, active (by default), insurer panel = Yes, and TPA panel = Yes (or In-House/Self as applicable).
- Empanelment is displayed explicitly in every recommendation row.
- ASP history ranks eligible hospitals; it never overrides empanelment.
- Bill vs approval deductions are visible inline and high-gap options are highlighted.
- Last exact insurer+TPA case and last procedure case are shown.
- Pincode is optional and enables approximate distance/map context.

## Data
Live published Google Sheet CSV URLs are configured in `config.js`.
Procedure business targets and separate-component rules are in `targets.js`.

## Deployment
Upload all files to the GitHub Pages repository root and deploy from `main / root`.
