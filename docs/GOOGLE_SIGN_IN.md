# Google account sign-in

PodyGuard uses the Google Identity Services button to create accounts and sign
back in. Google supplies a signed ID token, which the backend verifies using
Google's official Node library. No Resend account, sending domain, client secret,
paid auth service, Identity Platform subscription, or cloud compute resource is
needed for this integration. Do not enable billing or purchase anything to set it
up. Guests joining events still do not need an account.

## One-time owner setup

1. Open https://console.cloud.google.com/auth/overview and create/select a project
   named PodyGuard. The Google Cloud console is used to register the application;
   we are not moving hosting or the database there.
2. In Google Auth Platform, complete Branding with the app name **PodyGuard**,
   your support email, and developer contact email. Keep the optional logo and
   custom-domain links unset while developing. Do not invent links or claim a
   domain you do not own.
3. Set Audience to **External**. While the app is in **Testing**, add your own
   Google account and your friends as test users. Follow any limits or policy
   requirements Google shows. This is sufficient for the development rehearsal;
   public availability requires reviewing Google's publishing requirements later.
4. Under Clients, create a client of type **Web application**, named
   **PodyGuard web**. Add these Authorized JavaScript origins (origins only,
   with no path, slash suffix, or hash):

   - `https://tsuina311.github.io`
   - `https://podyguard.onrender.com`
   - `http://localhost`
   - `http://localhost:5173`

   Add another localhost port only if you actually use it. A phone/LAN HTTP IP
   address is not a substitute for an authorized HTTPS origin. This integration
   uses a popup and JavaScript callback, so no Authorized redirect URI is needed.
5. Copy the **Client ID**, ending in `.apps.googleusercontent.com`. The client ID
   is public. Do not copy a client secret into Render or the frontend.
6. Open Render -> podyguard -> Environment -> Edit. Add `GOOGLE_CLIENT_ID` with
   that value. Keep `DATABASE_URL` and `PARTICIPANT_SESSION_SECRET` unchanged.
   Save only when preparing before merge, or save and deploy when the new code
   is already deployed. Remove unused `RESEND_API_KEY` and `AUTH_EMAIL_FROM`
   variables if you added them; the app no longer reads them.
7. For local development, put the client ID in `apps/server/.env`. The frontend
   obtains the ID and a fresh nonce from `/api/auth/google/config`; there is no
   separate Vite client ID or GitHub repository variable to synchronize.

## Verify after deployment

Open `https://tsuina311.github.io/PodyGuard/#/account`, click **Continue with
Google**, and choose your Google account. The first successful login creates a
PodyGuard account. Later logins return to the same account. Check your saved
playgroups, refresh the page, sign out, and sign in again. Also test from a fresh
browser session and with a second allowed test user.

If Google reports `origin_mismatch`, check the exact origin above and allow time
for Google's client settings to propagate. If access is restricted in Testing,
check the test-user list. If the button cannot load, check browser blocking of
`https://accounts.google.com/gsi/client`. If PodyGuard says sign-in is unavailable,
check `GOOGLE_CLIENT_ID` on the running backend. After an expired or failed login,
**Try again** obtains a fresh challenge. Server restarts invalidate pending
challenges; retrying is safe. Do not share ID tokens or account bearer tokens in
screenshots or logs.

## Existing accounts and safety

- Existing sessions remain valid with the same database and session secret.
- Google subject (`sub`), rather than email or display name, identifies returning
  Google users. Profile and email changes do not create a second account or
  switch ownership to a different Google user.
- On the first Google login, an existing account with the same email is linked
  only when Google is authoritative for that email: Gmail, or a verified Google
  Workspace email with an `hd` claim. The original PodyGuard account ID, custom
  display name, owned playgroups, saved Commanders and history remain intact.
- A matching email already linked to a different Google subject is never
  reassigned. Existing accounts with third-party email addresses cannot be
  automatically linked on Google's `email_verified` claim alone. Do not create a
  replacement account or rewrite ownership to work around this. Account recovery
  for those addresses needs a separately agreed ownership-verification flow.
- Production email-code and unverified Neon compatibility endpoints reject
  login. Development/domain tests and the isolated demo retain their existing
  fixture helpers; the public account screen offers only Google.
- The backend validates signature, audience, issuer, lifetime, verified email,
  and a short-lived single-use nonce bound to the initiating request origin.
  Login uses JSON callbacks and explicit bearer sessions, without cross-site
  login cookies or URL tokens. No Gmail/Drive/Contacts permissions are requested.

## Automated verification and remaining checks

Server tests use real RSA-signed fixtures and stub only Google's public-key
lookup. They cover new accounts, legacy Gmail/Workspace migration, preserved
data/sessions, changed emails, identity conflicts, concurrent binding, invalid
signature/audience/issuer/expiry/email/nonce, replay, and disabled configuration.
Browser tests stub Google's external SDK and credential exchange, then exercise
the real dashboard, reload, sign-out/sign-in, error recovery, and blocked SDK.
Automated tests do not sign into a real Google account. The owner must complete
the Google-console setup and real popup/phone rehearsal; dedicated managed test
database verification is also still a separate release check.

References:
- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
- https://developers.google.com/identity/gsi/web/guides/display-button
