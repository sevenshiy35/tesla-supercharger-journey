# First administrator setup

Complete this only after the Phase 2A migration has been applied. Administrator membership is a
server-managed allowlist and cannot be changed through the application client.

1. Open **Supabase Dashboard → Authentication → Users**.
2. Create the intended administrator user.
3. Copy that user's UUID. Do not add a real UUID to this repository.
4. In **SQL Editor**, execute:

```sql
insert into public.app_admins (user_id)
values ('替换为实际UUID');
```

5. Verify the row exists in the SQL Editor:

```sql
select user_id, created_at
from public.app_admins
where user_id = '替换为实际UUID';
```

After a login flow exists, sign in as that user and verify `public.is_app_admin()` returns `true` for
its own session. Also run the administrator tests in `SECURITY-CHECKLIST.md`. A publishable key by
itself is never sufficient; the request must have an authenticated user whose UUID is allowlisted.
