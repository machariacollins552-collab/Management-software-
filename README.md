# Property Manager

A rent and property management app for landlords and their tenants. Installable on a phone from the browser (PWA).

**Live app:** https://machariacollins552-collab.github.io/Management-software-/

## What it does

**Tenants**
- Sign up with name, email, room number and password (with show/hide password and a consent checkbox)
- Balance due, books of account, payment history, water bills and a rent-owed graph
- Pay rent by M-Pesa (STK push)
- Each tenant sees only their own page

**Owner**
- Dashboard: total owed, collected this month, every tenant's balance
- Approve or suspend tenants, change room numbers
- Bill one tenant or all tenants (rent, water, other)
- Record cash or bank payments
- Activity log of every change
- Protected by two-factor login (authenticator app)

**Settings:** light/dark mode and font choice (serif, sans, mono).

## How it is built

- Front end: plain HTML, CSS and JavaScript in this repo, hosted on GitHub Pages
- Back end: Supabase (login, database, M-Pesa edge function)
- Privacy: Row Level Security in the database, so tenants can only read their own records
- Owner access: needs the owner role plus a two-factor code

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App page |
| `app.js` | All app logic |
| `style.css` | Copper old-money design, light and dark |
| `sw.js` | Offline shell for the installed app |
| `manifest.webmanifest` | Install details |
| `icon-192.png`, `icon-512.png` | App icons |

## First-time setup

1. Turn on GitHub Pages: Settings, Pages, deploy from branch `main`, folder `/ (root)`.
2. In Supabase, open Authentication, URL Configuration and set the Site URL to the live app address above.
3. In Supabase, open Edge Functions, Secrets and add `DARAJA_KEY`, `DARAJA_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_ENV` (`sandbox` while testing) and `CALLBACK_SECRET` (a long random text).
4. Sign up once in the app, then run this in the Supabase SQL Editor with your own email:
   `update public.profiles set role = 'admin', approved = true where email = 'YOUR_EMAIL';`
5. Sign in through the owner page (tap the logo 5 times, or add `#owner` to the address) and set up your authenticator app.

## Security notes

- Never put the Supabase service key or Daraja keys in this repo. Only the public anon key is used in the app.
- Card, bank and PayPal payments are not built yet. Only M-Pesa works online.
- Test M-Pesa in sandbox mode before using real money.
