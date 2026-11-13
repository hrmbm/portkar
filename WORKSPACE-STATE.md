# PORTKAR — workspace state

Updated: 2026-11-13 (Asia/Jakarta)

## Repository checkpoint
- Repository: `hrmbm/portkar`
- Working branch: `feat/form-ocr-region-improvements`
- Current verified branch HEAD before this follow-up: `a0ff5a6807f926a95b067a883145dc68b4b80bc1`.
- Branch comparison: 47 commits ahead of `main`, 0 behind (re-verified 2026-11-13).
- Do not merge this branch to `main` until all requested audits and CI checks pass.

## Connected Supabase
- Project: `Portal` (`osjikdsebniwnzancsjl`), region `ap-southeast-2`, PostgreSQL 17.
- Public region lookup tables exist and have RLS enabled: provinces (38), regencies (514), districts (7,285), villages (83,762); villages include `postal_code`.
- Applied DB migration history includes `region_village_postal_lookup` (version `20261113083245`); this migration is not yet present in the checked-out branch tree and must be reconciled during the documentation audit.
- The current database has an active `ktp-ocr` Edge Function (v4) that previously forwarded KTP images to an upstream OCR API. Batch 1 will retire that endpoint.

## Completed / in progress
### Batch 1 — browser-only KTP OCR (implementation committed; CI follow-up in progress)
- Keep private KTP photo storage in the `candidate-identity` bucket for HR review.
- Move all OCR inference to Tesseract.js in the browser using its v5 worker API.
- Enforce a maximum of three OCR attempts; after the limit, the user is offered manual entry while the uploaded KTP remains attached to the draft.
- Remove the browser's call to `/functions/v1/ktp-ocr`.
- Replace the old Edge Function source with an HTTP 410 retirement response; it must not forward images or call upstream OCR services.
- Remove the obsolete `services/ktp-ocr` Docker service sources from this branch.
- Commit `a0ff5a6807f926a95b067a883145dc68b4b80bc1` contains the browser-only path and 410 Edge Function source. GitHub Actions confirmed `npm run check` passes; `npm test` reported 22/23 due solely to an incorrect test expectation (`instance.terminate()` versus the actual cleanup helper `terminateWorker()`), now corrected in this follow-up.

## Validation and environment notes
- Latest confirmed branch HEAD: `a0ff5a6807f926a95b067a883145dc68b4b80bc1`; do not assume an uploaded checkpoint overrides the live GitHub ref.
- `npm run check` passed on that commit. `npm test` failed 1/23 only at the worker-termination source assertion; the implementation calls `worker.terminate()` inside `terminateWorker()` and the assertion is being aligned with the implementation.
- Tests available: `npm run check` and `npm test` (Node.js 22; GitHub Actions workflow `.github/workflows/portkar-checks.yml`).
- Local clone/test execution is unavailable in this workspace because outbound DNS resolution for `github.com` failed; push commits to the working branch to trigger GitHub Actions and verify its result.
- Supabase deployment of the 410 Edge Function has not yet been verified.
- Supabase security advisor currently reports SECURITY DEFINER RPC exposure warnings, two RLS-enabled tables without policies (`admin_login_credentials`, `candidate_drafts`), and disabled leaked-password protection; review without changing access controls blindly.

## Next batches
1. Verify this OCR test correction and deploy the 410 `ktp-ocr` Edge Function to Supabase; then continue with persistent, TTL-bounded region lookup cache and request sequencing to prevent stale province/regency/district/village responses from repainting dropdowns.
2. Guard asynchronous postal-code lookups against a changed village selection; keep using the existing village postal lookup RPC.
3. MITRA teal/orange/ivory/sage theme and identify the original company logo asset (the branch currently uses a text-only `PK` placeholder; do not fabricate an original logo).
4. Reconcile migrations, tests, and docs; audit form/draft persistence/HR panel and compatibility; verify CI and Supabase advisors.
