import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('dashboard login accepts username + numeric PIN and calls the server function', async () => {
  const [html, js] = await Promise.all([read('../index.html'), read('../assets/js/admin.js')]);
  assert.match(html, /id="login-user"[^>]*autocomplete="username"/);
  assert.match(html, /id="login-pin"[^>]*pattern="\[0-9\]\{4,12\}"/);
  assert.match(js, /\/functions\/v1\/admin-login/);
  assert.match(js, /supabase\.auth\.setSession/);
  assert.doesNotMatch(js, /supabase\.auth\.signInWithPassword/);
});

test('database stores bcrypt PIN hashes and enforces temporary lockout', async () => {
  const sql = await read('../supabase/SETUP-ALL-IN-ONE.sql');
  assert.match(sql, /extensions\.crypt\(v_pin, extensions\.gen_salt\('bf', 12\)\)/);
  assert.match(sql, /v_username text := lower\(btrim\('Admin'\)\)/);
  assert.match(sql, /username = lower\(btrim\(username\)\)/);
  assert.match(sql, /v_attempts >= 5/);
  assert.match(sql, /interval '15 minutes'/);
  assert.match(sql, /grant execute on function public\.verify_admin_pin\(text,text\) to service_role/i);
  assert.match(sql, /revoke all on public\.admin_login_credentials from public, anon, authenticated/i);
});

test('edge function keeps service role server-side and uses it to provision Auth sessions', async () => {
  const fn = await read('../supabase/functions/admin-login/index.ts');
  assert.match(fn, /SUPABASE_SECRET_KEYS/);
  assert.match(fn, /SUPABASE_PUBLISHABLE_KEYS/);
  assert.match(fn, /suppliedApiKey !== publishableKey/);
  assert.match(fn, /service\.auth\.admin\.createUser/);
  assert.match(fn, /service\.auth\.admin\.updateUserById/);
  assert.match(fn, /publicClient\.auth\.signInWithPassword/);
  assert.match(fn, /deriveInternalPassword/);
});

