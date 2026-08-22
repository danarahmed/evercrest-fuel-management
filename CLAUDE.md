# EverCrest Fuel Dispatch — project rules

## Scope & isolation (standing user instructions)

1. **This is a standalone project. Never mix it with any other project** (in
   particular a separate "booking" project). Do not read from, write to, or
   borrow code/config/data from other projects when working here.

2. **Supabase — use this project's database only.** This app's Supabase
   project is **"Fuel Dispatch"**, id **`ewfgjupzkdvzmbbbxvxw`**
   (org `uqyrsfxrkvekomroehfn`, region eu-central-1). Any SQL, migration,
   RPC, storage, or advisor work must target this id. It is a **different
   Supabase project from the booking app** — never touch the booking
   database from here, and never touch this one from the booking project.
   If a task is ambiguous about which database it means, confirm before
   running anything against Supabase.

## Deployment

- Hosted on Vercel (team **DandS**), project **evercrest-fuel-management**,
  auto-deploys from the `main` branch on push.
- Stable production URL: https://evercrest-fuel-management-git-main-dand-s.vercel.app
