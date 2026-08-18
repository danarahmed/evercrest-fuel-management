# Evercrest Fuel Management

Fuel dispatch for the station network: a station asks for fuel, the office
approves it, the yard loads a truck, and the station confirms what arrived
against a signed manifest.

Live: https://fuel-dispatch-dand-s.vercel.app

The app is bilingual (Kurdish Sorani, right-to-left, is the default; English is
one tap away) and is built mobile-first, because it is used on a phone at a
forecourt.

## The workflow

```
station          manager / admin       storage / admin        station / admin
  place    ──▶      approve      ──▶     mark loaded    ──▶   confirm delivery
  order            or reject             + truck info         + signed manifest

  pending    →    approved / rejected  →     loaded      →       delivered
```

A station may cancel its own order while it is still pending. A manager or
admin may cancel a pending or approved one. Every transition is written to
`order_events`, so each order carries its own audit trail.

## Roles

| Role      | Sees                                    | Can do                              |
|-----------|-----------------------------------------|-------------------------------------|
| `station` | its own station's orders only           | place, cancel pending, confirm delivery |
| `manager` | every order                             | approve, reject, cancel             |
| `storage` | every order                             | mark loaded                         |
| `admin`   | everything                              | all of the above, plus setup        |

Every role gets a **My orders** tab: the orders that account placed or acted
on, searchable and filterable, with no date window hiding older work.

## Running it

```bash
npm install
npm run build      # → dist/
npm run dev        # rebuild on change
npm test           # unit tests for the formatting + CSV escaping helpers
```

`dist/` is a plain static bundle — `index.html`, `app.js`, `styles.css`. There
is no server-side code.

## Layout

```
public/          index.html + styles.css, copied to dist as-is
src/
  main.jsx       mounts the app
  App.jsx        session, role → tabs, realtime refresh
  lib/
    supabase.js  client + username→email mapping
    api.js       every query and RPC, with real error handling
    i18n.js      en / ku dictionary (kept in sync, 182 keys each)
    util.js      formatting, dates, CSV escaping
  components/    Auth, OrdersList, OrderCard, ActionSheet, NewOrder,
                 Reports, Admin, Account, common
supabase/migrations/   schema + security changes, in order
test/            unit tests
```

## How security works

The browser holds only the Supabase *publishable* key. On its own that key
grants nothing:

- **Row level security is on for every table.** A `station` account can only
  read rows for its own station; `orders` has no INSERT/UPDATE/DELETE policy at
  all, so nothing can write to it directly.
- **Every state change goes through a `SECURITY DEFINER` function** —
  `place_order`, `decide_order`, `mark_loaded`, `confirm_delivery`,
  `cancel_order` — and each one re-checks the caller's role and the order's
  current status server side. The UI hides buttons you may not press; the
  database is what actually enforces it.
- **Manifests live in a private bucket**, partitioned by station id. A station
  can only read and write under its own folder, uploads are capped at 15 MB and
  restricted by MIME type, and files are served through short-lived signed URLs.
- **Admin actions** (create user, set password, delete user) are database
  functions gated on `my_role() = 'admin'`, so a tampered client cannot reach
  them.

See [`docs/SECURITY.md`](docs/SECURITY.md) for the audit that produced the
current state, including what was found and what is still worth doing.

## Deploying

The Vercel project builds `npm run build` and serves `dist/`. Security headers,
including a strict Content-Security-Policy that pins `connect-src` to the
Supabase project, are set in `vercel.json`.

Database changes are the migrations under `supabase/migrations/`, applied in
filename order.
