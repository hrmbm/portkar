-- Prevent anonymous API calls to the admin-check and internal DDL event helper.
-- RLS policies still invoke is_portal_admin() for signed-in HR users.
revoke execute on function public.is_portal_admin() from public, anon;
grant execute on function public.is_portal_admin() to authenticated;

-- This function is bound to a database event trigger, not used as an application RPC.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
