// Hexa Network Intelligence — data source configuration
// Google Sheet is already published as CSV for the current dashboard.
window.HEXA_CONFIG = {
  HOSPITAL_CSV: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRrd9wkjq0MLRYCp5k2fBRnHdjOpeTgGuL6eLwIlQuAAdK0PsANa9zGiiF9Owh-BsC_sRPkdl1S0PC8/pub?gid=0&single=true&output=csv',
  ASP_CSV: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRrd9wkjq0MLRYCp5k2fBRnHdjOpeTgGuL6eLwIlQuAAdK0PsANa9zGiiF9Owh-BsC_sRPkdl1S0PC8/pub?gid=1167367380&single=true&output=csv',
  REFRESH_MS: 10 * 60 * 1000,
  DEFAULT_RADIUS_KM: 25,
  DEDUCTION_HIGH_PCT: 20,
  DEDUCTION_SEVERE_PCT: 30,
  // In-House / Self is not a TPA column in Sheet 1 and is treated as self-managed.
  SELF_TPA_LABEL: 'In-House / Self'
};
