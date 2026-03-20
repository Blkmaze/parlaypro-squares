# ParlayPro Squares - Progress Tracker
Last updated: March 20, 2026

## CURRENT STATUS: Security hardening complete, pending deploy

## What's done
- Score strip + quarter table + winning highlights + tally (Mar 20)
- Atomic auto-assign via /api/auto-assign
- Grid numbers synced server-side via /api/init-numbers
- Reset broadcasts via resetAt timestamp (8s polling)
- Mobile grid layout fixed
- Payment flow: Cash=instant, CashApp/PayPal=pending til admin confirms
- PIN gate on admin panel (2826 default / 0614 master)

## Security fixes added (Mar 20 - current session)
- Rate limiting: 10 req/min on buy endpoints, 30/min on others
- Input sanitization: initials (letters/numbers only), gameId (alphanumeric only), sport, date
- CORS locked to parlaypro-squares.netlify.app only
- confirm-pending now requires PIN (was open to anyone - BUG FIXED)
- Request body size limit 10KB
- Error messages sanitized (no internal stack traces exposed)
- Security headers: X-Content-Type-Options, X-Frame-Options

## Deploy command (run from parlaypro-squares-repo folder)
git pull origin main
npx netlify-cli deploy --prod --dir . --site 658f40e1-9d0f-4072-80a5-d6d0eb35d77e --auth nfp_Anbs9L3Kpc4nSxKjHr5Bvsr13SJBJ7Ni7e5f

## Next up
- [ ] Stripe integration on parlaypro-live
- [ ] Auto-save board state every 15 min
- [ ] parlaypro-live security hardening
