import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type JsonObject = Record<string, unknown>;

function json(status: number, body: JsonObject) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}

function readNamedKey(jsonEnvName: string, legacyEnvName: string): string | null {
  const raw = Deno.env.get(jsonEnvName);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      if (typeof parsed.default === 'string' && parsed.default) return parsed.default;
      const first = Object.values(parsed).find(value => typeof value === 'string' && value.length > 10);
      if (first) return first;
    } catch (error) {
      console.error(`Could not parse ${jsonEnvName}:`, error);
    }
  }
  return Deno.env.get(legacyEnvName) || null;
}

async function deriveInternalPassword(username: string, pin: string, serverSecret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(serverSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC', key, encoder.encode(`portal-karir-admin-v1:${username}:${pin}`),
  );
  return hex(new Uint8Array(signature));
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Metode tidak diizinkan.' });

  try {
    const projectUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = readNamedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
    const publishableKey = readNamedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');

    if (!projectUrl || !serviceKey || !publishableKey) {
      console.error('Missing Supabase URL or server-side API keys.');
      return json(503, { error: 'Layanan login belum dikonfigurasi di Supabase.' });
    }

    // Endpoint login memang dipanggil sebelum user memiliki sesi Auth.
    // Wajib sertakan publishable key aplikasi; kunci ini bukan secret.
    const suppliedApiKey = request.headers.get('apikey') || '';
    if (suppliedApiKey !== publishableKey) {
      return json(401, { error: 'Permintaan aplikasi tidak dikenali. Muat ulang portal.' });
    }

    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Format permintaan tidak valid.' });
    }

    const username = String(body.username ?? '').trim().toLowerCase();
    const pin = String(body.pin ?? '').trim();

    if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) {
      return json(400, { error: 'Username harus 3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.' });
    }
    if (!/^\d{4,12}$/.test(pin)) {
      return json(400, { error: 'PIN harus terdiri dari 4–12 angka.' });
    }

    const service = createClient(projectUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const publicClient = createClient(projectUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: verification, error: verifyError } = await service.rpc('verify_admin_pin', {
      p_username: username,
      p_pin: pin,
    });
    if (verifyError) {
      console.error('PIN verification RPC failed:', verifyError.message);
      return json(503, { error: 'Database login belum siap. Jalankan SETUP-ALL-IN-ONE.sql di SQL Editor.' });
    }

    const credential = Array.isArray(verification) ? verification[0] : verification;
    if (!credential?.ok) {
      return json(401, { error: credential?.message || 'Username atau PIN tidak sesuai.' });
    }

    const internalEmail = `${username}@portal.internal`;
    const internalPassword = await deriveInternalPassword(username, pin, serviceKey);
    let authUserId = credential.auth_user_id as string | null;

    if (!authUserId) {
      const { data: legacyUserId, error: lookupError } = await service.rpc('find_admin_auth_user', {
        p_username: username,
      });
      if (lookupError) {
        console.error('Auth lookup failed:', lookupError.message);
        return json(503, { error: 'Akun admin belum dapat disiapkan. Periksa tabel Auth Supabase.' });
      }
      authUserId = legacyUserId || null;
    }

    if (authUserId) {
      const { data: existing, error: getUserError } = await service.auth.admin.getUserById(authUserId);
      if (getUserError || !existing?.user) authUserId = null;
    }

    if (authUserId) {
      const { error: updateError } = await service.auth.admin.updateUserById(authUserId, {
        password: internalPassword,
        email: internalEmail,
        email_confirm: true,
        user_metadata: { username, display_name: credential.display_name },
      });
      if (updateError) {
        console.error('Auth user synchronization failed:', updateError.message);
        return json(503, { error: 'Akun login internal gagal disinkronkan. Periksa konfigurasi Auth.' });
      }
    } else {
      const { data: created, error: createError } = await service.auth.admin.createUser({
        email: internalEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: { username, display_name: credential.display_name },
      });
      if (createError || !created?.user) {
        console.error('Auth user creation failed:', createError?.message);
        return json(503, { error: 'Akun login internal gagal dibuat. Periksa Authentication → Users.' });
      }
      authUserId = created.user.id;
    }

    if (!authUserId) {
      return json(503, { error: 'Identitas admin internal belum dapat dibuat. Periksa log Edge Function.' });
    }
    const finalAuthUserId = authUserId;

    const [{ error: credentialUpdateError }, { error: adminUpsertError }] = await Promise.all([
      service.from('admin_login_credentials')
        .update({ auth_user_id: finalAuthUserId, last_login: new Date().toISOString() })
        .eq('username', username),
      service.from('admin_users').upsert({
        user_id: finalAuthUserId,
        display_name: credential.display_name || 'HR Admin',
        role: credential.role || 'admin',
      }, { onConflict: 'user_id' }),
    ]);

    if (credentialUpdateError || adminUpsertError) {
      console.error('Admin profile synchronization failed:', credentialUpdateError?.message, adminUpsertError?.message);
      return json(503, { error: 'Profil admin belum tersimpan. Periksa setup SQL lalu coba kembali.' });
    }

    const { data: signedIn, error: signInError } = await publicClient.auth.signInWithPassword({
      email: internalEmail,
      password: internalPassword,
    });
    if (signInError || !signedIn.session) {
      console.error('Supabase session creation failed:', signInError?.message);
      return json(503, { error: 'Sesi login gagal dibuat. Pastikan Auth → Sign In → Email aktif.' });
    }

    return json(200, {
      ok: true,
      display_name: credential.display_name || 'HR Admin',
      session: {
        access_token: signedIn.session.access_token,
        refresh_token: signedIn.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('Unexpected admin login error:', error);
    return json(500, { error: 'Terjadi gangguan saat login. Silakan coba kembali.' });
  }
});
