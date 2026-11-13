# PORTKAR KTP OCR service

This container runs the pinned upstream [arakattack/ocr-ktp](https://github.com/arakattack/ocr-ktp) implementation (YOLO field detection + EasyOCR/Tesseract). It is optional: the candidate browser still has a Tesseract.js fallback when this service is not configured.

## Run

1. Install Docker Engine and Docker Compose on a machine with enough RAM for PyTorch, YOLO, and EasyOCR (plan for at least 4–6 GB RAM for this workload).
2. Set an API key in the host environment (do not commit it):

   ```sh
   export KTP_OCR_API_KEY='generate-a-long-random-secret'
   docker compose up -d --build
   ```

3. Put the service behind HTTPS using a reverse proxy or an HTTPS-capable host. Do not expose the upstream HTTP port directly to the public internet.
4. In Supabase Dashboard → Edge Functions → Secrets, set:
   - `KTP_OCR_API_URL`: the HTTPS URL for the OCR service (the root endpoint accepts POST multipart form data).
   - `KTP_OCR_API_KEY`: exactly the same secret as `KTP_OCR_API_KEY` used by the container.
5. Redeploy `ktp-ocr` only if its code changes; Edge Function environment secrets take effect at runtime.

The upstream response is normalized by `assets/js/applicant.js` into PORTKAR field names. If the endpoint is unreachable, not configured, or returns incomplete data, the browser fallback tries OCR locally. Each candidate gets three photo attempts before manual entry is unlocked.

## Security / operational notes

- Use a unique API key; never copy the demo key from upstream docker-compose.
- Keep the bucket `candidate-identity` private. HR opens photos through a signed URL generated after admin login.
- Add HTTPS, firewall rules, reverse-proxy upload limits (8 MB), request timeouts, and monitoring.
- The upstream image includes PyTorch / YOLO / EasyOCR dependencies and is materially heavier than a browser-only OCR library. "Free software" does not make compute or hosting free.
- This service is CPU-capable, but GPU acceleration may improve throughput. One Gunicorn worker avoids loading the YOLO model repeatedly into memory.
