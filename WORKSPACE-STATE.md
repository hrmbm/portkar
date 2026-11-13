# PORTKAR — workspace state

Updated: 2026-11-13 (Asia/Jakarta) — persistent region cache and postal lookup batch

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
### Batch 1 — browser-only KTP OCR (code committed; CI verification pending)
- `ktp-ocr` currently exists in Supabase as ACTIVE v4; its deployed source was fetched and returns HTTP 410 without forwarding to an upstream OCR provider.
- Current OCR code runs Tesseract.js via `createWorker('ind+eng', 1, ...)` in the browser. Private image upload remains separate for HR verification.
- CI sequence: `a0ff5a...` had 22/23 tests because the worker termination assertion was incorrect; `9555e4...` repeated the same mismatch; `501394bed5381fef544448430458156032b2501a` corrects it to the actual `const terminateWorker=async` implementation and has a new Actions run in progress.
- Keep private KTP photo storage in the `candidate-identity` bucket for HR review.
- Move all OCR inference to Tesseract.js in the browser using its v5 worker API.
- Enforce a maximum of three OCR attempts; after the limit, the user is offered manual entry while the uploaded KTP remains attached to the draft.
- Remove the browser's call to `/functions/v1/ktp-ocr`.
- Replace the old Edge Function source with an HTTP 410 retirement response; it must not forward images or call upstream OCR services.
- Remove the obsolete `services/ktp-ocr` Docker service sources from this branch.
- Commit `a0ff5a6807f926a95b067a883145dc68b4b80bc1` contains the browser-only path and 410 Edge Function source. GitHub Actions confirmed `npm run check` passes; `npm test` reported 22/23 due solely to an incorrect test expectation (`instance.terminate()` versus the actual cleanup helper `terminateWorker()`), corrected in `9555e4fc9ae99d636fc2babf76abc208332ab5aa`; the second run revealed the cleanup helper is a `const terminateWorker=async` arrow function, so the source assertion is corrected in this follow-up.

### Batch 2 — region cache, dropdown race guards, automatic postal lookup (implementation committed in this checkpoint)
- Use a versioned IndexedDB cache with a 7-day TTL and at most 100 persistent/in-memory entries; retain in-flight request deduplication.
- Add a per-form generation guard so out-of-order parent/child/select and search results cannot repaint newer choices.
- Use the live RPC `list_region_villages_with_postal_code(p_district_id, p_search, p_limit)`; village select options carry `postal_code`, so selection fills Kode Pos without an extra RPC.
- Add `20261113083245_region_village_postal_lookup.sql` to the repository to reconcile the already-applied Supabase migration (version `20261113083245`). Do not apply this migration again to the live database.

## Validation and environment notes
- Latest confirmed branch HEAD: `501394bed5381fef544448430458156032b2501a` (latest checkpoint before batch 2); do not assume an uploaded checkpoint overrides the live GitHub ref.
- `npm run check` passed on that commit. `npm test` failed 1/23 only at the worker-termination source assertion; the implementation calls `worker.terminate()` inside `terminateWorker()` and the first correction still used the wrong declaration syntax; the assertion now targets `const terminateWorker=async` and `await worker.terminate()`.
- Tests available: `npm run check` and `npm test` (Node.js 22; GitHub Actions workflow `.github/workflows/portkar-checks.yml`).
- Region RPC definition verified directly in the live database: `list_region_villages_with_postal_code(p_district_id text, p_search text, p_limit integer)` returns `id, name, area_type, postal_code`, is SECURITY INVOKER, has empty search_path, and grants EXECUTE to `anon` and `authenticated`.
- Local clone/test execution is unavailable in this workspace because outbound DNS resolution for `github.com` failed; push commits to the working branch to trigger GitHub Actions and verify its result.
- Supabase Edge Function `ktp-ocr` is currently ACTIVE at version 4 and its retrieved deployed source returns HTTP 410 without any upstream call.
- Supabase security advisor currently reports SECURITY DEFINER RPC exposure warnings, two RLS-enabled tables without policies (`admin_login_credentials`, `candidate_drafts`), and disabled leaked-password protection; review without changing access controls blindly.

## Next batches
1. Verify GitHub Actions for current batch commit; if it fails, fix the exact reported assertion before proceeding.
2. Verify cold/warm IndexedDB cache and rapid parent-selection race behavior in browser tests.
3. MITRA teal/orange/ivory/sage theme and identify the original company logo asset (the branch currently uses a text-only `PK` placeholder; do not fabricate an original logo).
4. Reconcile migrations, tests, and docs; audit form/draft persistence/HR panel and compatibility; verify CI and Supabase advisors.
