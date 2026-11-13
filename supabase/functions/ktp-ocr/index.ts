import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json(405, { error: true, message: "Metode tidak diizinkan.", data: {} });

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8 * 1024 * 1024) return json(413, { error: true, message: "Ukuran foto maksimal 8 MB.", data: {} });

  const upstream = Deno.env.get("KTP_OCR_API_URL");
  const apiKey = Deno.env.get("KTP_OCR_API_KEY");
  if (!upstream || !apiKey) {
    return json(503, {
      error: true,
      message: "OCR server belum dikonfigurasi. OCR gratis di perangkat akan digunakan sebagai cadangan.",
      data: {},
    });
  }

  try {
    const incoming = await request.formData();
    const image = incoming.get("image");
    if (!(image instanceof File)) return json(400, { error: true, message: "Foto KTP tidak ditemukan.", data: {} });
    if (image.size < 1 || image.size > 8 * 1024 * 1024) return json(413, { error: true, message: "Ukuran foto maksimal 8 MB.", data: {} });
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) {
      return json(415, { error: true, message: "Format foto harus JPG, PNG, atau WebP.", data: {} });
    }

    const form = new FormData();
    form.append("image", image, "ktp.jpg");
    form.append("ocr_choice", String(incoming.get("ocr_choice") || "easyocr"));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(upstream, {
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
