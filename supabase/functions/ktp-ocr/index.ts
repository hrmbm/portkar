import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
};

// OCR is intentionally browser-only. Keep a small tombstone during migration so
// stale clients fail clearly instead of forwarding identity documents upstream.
Deno.serve((request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(JSON.stringify({
    error: true,
    code: "OCR_BROWSER_ONLY",
    message: "Pemrosesan OCR KTP telah dipindahkan ke browser kandidat. Tidak ada gambar yang diproses oleh layanan OCR server.",
  }), { status: 410, headers: corsHeaders });
});
