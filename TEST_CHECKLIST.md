# V5 Test Checklist

- [ ] Dashboard loads live Hospital Network + ASP Data.
- [ ] City, Procedure, Insurer and TPA filters populate.
- [ ] Search never recommends an ASP-only hospital absent from Sheet 1.
- [ ] Active-only search excludes inactive/on-hold hospitals.
- [ ] Every recommended row visibly shows `EMPANELLED`, `Insurer YES`, `TPA YES`.
- [ ] A hospital with insurer = No in Sheet 1 never qualifies for that insurer.
- [ ] A hospital with TPA = No in Sheet 1 never qualifies for that TPA.
- [ ] Matching hard operational restriction is excluded unless Include restricted/hold is checked.
- [ ] Median bill, target variance, median approval, approval realization, deduction amount/% are shown.
- [ ] Major deduction rows are highlighted.
- [ ] Comparable case count, last exact case, last procedure case and confidence are shown.
- [ ] Pincode enables approximate distance where coordinates exist.
- [ ] Map expands only when requested.
- [ ] Clicking a result opens detailed evidence; detail is hidden by default.
- [ ] Partner Hospital List retains old-style table/coverage/comments.
- [ ] Export outputs top 5 options.
