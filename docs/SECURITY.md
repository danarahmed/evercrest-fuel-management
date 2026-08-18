# Security review

Review of the deployed app and its Supabase project, and what changed as a
result. Dated 18 August 2026.

## What was already right

Worth stating plainly, because it shaped the rest of the review: the data layer
was in good shape before this pass.

- RLS was enabled on all five tables, and `orders` / `order_events` had no
  write policies — every mutation already had to go through a vetted function.
- `orders_view` was declared `security_invoker = true`, so it did **not**
  silently bypass RLS the way an ordinary view would.
- Each workflow function re-checked role, station ownership and current status
  server side, and locked the row (`for update`) before deciding.
- `confirm_delivery` verified that the manifest path sat in the order's own
  station folder, so one station could not attach another's document.
- The manifest bucket was private, with per-station folder policies, a 15 MB
  cap and a MIME allow-list.
- `guard_profile_changes` stopped a user editing their own role, station or
  active flag, and stopped the last active admin being removed.

## Findings and fixes

### 1. The whole staff directory was readable by every active account — fixed

`profiles_select` was `(id = auth.uid() OR is_active_user())`. The second half
meant any active account — a station clerk, a yard hand — could read every
profile row: full names, phone numbers, roles and station assignments of all
staff.

Tightened to self, plus admin and manager:

```sql
using (id = auth.uid() or public.my_role() in ('admin','manager'))
```

Closing it would have blanked out "requested by / approved by" names on the
order cards, since `orders_view` runs as the invoker and joined `profiles`
directly. So the view now resolves names through a narrow `display_name(uuid)`
function that returns the one field the UI needs and nothing else.

*Migration: `20260818120000_harden_security.sql`*

### 2. Every RPC was callable by anonymous visitors — fixed

All fourteen `SECURITY DEFINER` functions had `EXECUTE` granted to `anon`, so
`/rest/v1/rpc/admin_create_user` was reachable without signing in.

The internal `my_role() <> 'admin'` guards meant this was **not** exploitable —
`my_role()` returns null for an anonymous caller, so every one of them raised.
It was still an unnecessary probe surface and inconsistent with intent.
`EXECUTE` is now revoked from `public` and `anon` across the board and granted
to `authenticated` only. The two trigger functions are revoked from everyone.

*Migrations: `20260818120000`, `20260818140000`*

### 3. CSV export was open to spreadsheet formula injection — fixed

The export quoted values but did nothing else. Excel and Sheets execute a cell
beginning `=`, `+`, `-` or `@` **even inside quotes**, so an order note reading
`=HYPERLINK("http://evil","click")` would run on whoever opened the report.

`csvCell()` now prefixes a bare apostrophe to any value starting with one of
those characters, which makes it inert and still readable. Covered by
`test/util.test.mjs`.

### 4. Silent truncation hid orders — fixed

The board fetched a flat `limit(400)` and the report `limit(2000)`, with no
indication when rows were dropped. Past those thresholds orders simply vanished
from the UI with the app looking perfectly normal.

Lists are now paged server-side with an exact count, so the screen states
"25 of 340" and offers *Show more*. The report still caps its working set, but
says so when it does.

### 5. "My orders" was a 7-day window — fixed

The only order list a station had defaulted to the last 7 days. A pending order
older than a week disappeared from the station's own screen, while the tab
badge — counted from a different, undated query — kept showing it. The list and
the badge disagreed.

**My orders** is now an all-time, searchable list of the orders an account
placed or acted on, and it exists for every role.

### 6. Failed writes were swallowed — fixed

Adding a fuel type, toggling a station and toggling a product all ignored the
returned error object entirely. If RLS or a constraint rejected the write, the
UI reported nothing and the row silently did not appear. Every write now goes
through a wrapper that throws, and every caller renders the message.

### 7. Orphaned manifest uploads — fixed

The delivery flow uploaded the manifest first and called `confirm_delivery`
second. If the RPC failed, the file stayed in the bucket, unreferenced, forever.
The upload is now rolled back on failure — best effort, since storage policy
deliberately does not allow deleting a manifest once a delivery is confirmed.

The stored file extension is also derived from the sniffed MIME type rather
than the user-supplied filename.

### 8. Passwords shown in clear, and no confirmation — fixed

The admin's "create user" and "reset password" fields were plain text inputs.
All password fields are now masked with an explicit show/hide toggle, and
changing your own password requires typing it twice.

### 9. White screen on a failed profile load — fixed

`if (!profile) return null` meant any hiccup loading the profile — a dropped
connection on a forecourt — left a blank white page with no message and no way
forward. There is now an explicit error state with retry and sign-out.

### 10. Modal accessibility — fixed

The sheet closed only on a backdrop click: no Escape key, no focus trap, no
scroll lock on the page behind it. All three are implemented, and focus returns
to the trigger on close.

### 11. Login does not reveal which accounts exist — verified

Wrong username and wrong password produce the same message. A genuine network
failure is now reported differently, which is a usability fix and leaks nothing.

### 12. Numeric guard rails — added

`loaded_quantity > 0` and `received_quantity >= 0` are enforced as table
constraints, and the client rejects non-positive or absurd quantities before
sending.

## Still open — needs a human in the Supabase dashboard

These cannot be set over SQL or the MCP connection.

1. **Enable leaked-password protection.**
   *Authentication → Policies → Password strength → "Check against HaveIBeenPwned"*.
   Currently off, so staff can pick a password from a known breach corpus.

2. **Confirm public sign-up is disabled.**
   *Authentication → Sign In / Providers → Email → "Allow new users to sign up"*.
   Accounts here are meant to be created by an admin. If self-signup is on,
   anyone can create an auth user; `handle_new_user` gives them an inactive
   profile so they cannot reach any data, but it is still unwanted noise.

3. **Consider raising the minimum password length** from 6. The database
   functions enforce 6 today; 10+ would be a straightforward change in
   `admin_create_user`, `admin_set_password` and the auth settings.

## Advisor state

The fourteen `anon_security_definer_function_executable` warnings are resolved.

The remaining `authenticated_security_definer_function_executable` warnings are
expected and correct: these functions *are* the app's API for signed-in users,
and each enforces its own role check internally. That is the intended design,
not an outstanding issue.
