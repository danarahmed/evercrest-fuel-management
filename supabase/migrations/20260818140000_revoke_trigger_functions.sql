-- Trigger functions are not API. They return `trigger`, so PostgREST will not
-- expose them as RPC endpoints, but the earlier revoke only removed the
-- `public` and `anon` grants and left an explicit `authenticated` grant in
-- place. Take that away too, so the grant list matches the intent.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_profile_changes() from public, anon, authenticated;
