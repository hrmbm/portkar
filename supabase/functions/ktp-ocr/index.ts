import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type, x-candidate-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: true, message: "Metode tidak diizinkan.", data: {} });

  try {
    const candidateToken = request.headers.get("x-candidate-token") || "";
    if (!UUID_V4.test(candidateToken)) {
      return json(401, { error: true, message: "Sesi kandidat tidak valid.", data: {} });
    }

    // Edge Function is public to support candidate applications without Auth.
    // Possession of the high-entropy draft token is verified server-side before
    // any call to the OCR provider is made.
    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !serviceKey) {
      return json(503, { error: true, message: "Validasi sesi OCR belum dikonfigurasi.", data: {} });
    }

    const service = createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: draft, error: draftError } = await service
      .from("candidate_drafts")
      .select("draft_token")
      .eq("draft_token", candidateToken)
      .maybeSingle();

    if (draftError) {
      console.error("KTP OCR draft validation failed:", draftError.message);
      return json(503, { error: true, message: "Sesi kandidat belum dapat diverifikasi.", data: {} });
    }
    if (!draft) {
      return json(401, { error: true, message: "Draf kandidat tidak ditemukan atau sudah dikirim.", data: {} });
    }

    const upstreamUrl = Deno.env.get("KTP_OCR_API_URL");
    const apiKey = Deno.env.get("KTP_OCR_API_KEY");
    if (!upstreamUrl || !apiKey) {
      return json(503, {
        error: true,
        message: "OCR server belum dikonfigurasi. OCR gratis di perangkat akan digunakan sebagai cadangan.",
        data: {},
      });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES + 128 * 1024) {
      return json(413, { error: true, message: "Ukuran foto maksimal 8 MB.", data: {} });
    }

    const incoming = await request.formData();
    const image = incoming.get("image");
    if (!(image instanceof File)) return json(400, { error: true, message: "Foto KTP tidak ditemukan.", data: {} });
    if (image.size < 1 || image.size > MAX_IMAGE_BYTES) {
      return json(413, { error: true, message: "Ukuran foto maksimal 8 MB.", data: {} });
    }
    if (!ALLOWED_TYPES.has(image.type)) {
      return json(415, { error: true, message: "Format foto harus JPG, PNG, atau WebP.", data: {} });
    }

    const form = new FormData();
    form.append("image", image, "ktp.jpg");
    form.append("ocr_choice", "easyocr");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "X-API-KEY": apiKey },
        body: form,
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.error) {
        return json(502, {
          error: true,
          message: payload?.message || "Layanan OCR gagal membaca KTP.",
          data: {},
        });
      }
      return json(200, payload);
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "Layanan OCR melewati batas waktu 25 detik."
      : "Layanan OCR tidak dapat dijangkau.";
    console.error("KTP OCR upstream failure:", error);
    return json(502, { error: true, message, data: {} });
  }
});
