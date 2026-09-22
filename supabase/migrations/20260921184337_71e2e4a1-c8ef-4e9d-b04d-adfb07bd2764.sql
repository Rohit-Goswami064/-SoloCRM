
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.seed_demo_data() from public, anon;
revoke all on function public.delete_demo_data() from public, anon;
grant execute on function public.seed_demo_data() to authenticated;
grant execute on function public.delete_demo_data() to authenticated;
