# Omnyid Google OAuth Setup

Google OAuth is currently used in the Omnyid preview landing flow through Google Identity Services popup sign-in on `omnyid.com`.

## OAuth App Type

Choose `Web application`.

## Current Client

- client name: `omnyid_cloud`
- client ID: `975613409177-nv214f97lors4g5j2dcvuftv5pf9c88p.apps.googleusercontent.com`

The client secret should stay in gitignored runtime env only. Do not place it in tracked docs or committed config.

## Authorized JavaScript Origins

Add these now:

- `https://omnyid.com`
- `https://api.omnyid.com`
- `https://cloud.omnyid.com`
- `http://localhost:3000`

## Authorized Redirect URIs

The current implementation uses popup mode, so the redirect URI is not used in the live browser flow today. It is still worth registering future-safe callback URLs now:

- `https://omnyid.com/auth/google/callback`
- `https://cloud.omnyid.com/auth/google/callback`
- `http://localhost:3000/auth/google/callback`

## Current Backend Verification

The homeserver verifies the Google ID token by calling:

- `https://oauth2.googleapis.com/tokeninfo`

The expected audience is:

- `OMNYID_GOOGLE_CLIENT_ID`

## Google Calendar OAuth (AFP calendar_event capability)

The `calendar_event` native AFP capability uses a separate offline refresh token scoped to Google Calendar. This is distinct from the sign-in flow above.

**Required OAuth scope:**
```
https://www.googleapis.com/auth/calendar
```

**Setup steps:**

1. Use the existing `omnyid_cloud` OAuth app (same client ID).
2. Add `https://www.googleapis.com/auth/calendar` to the app's enabled scopes in Google Cloud Console.
3. Run a one-time OAuth consent flow with `access_type=offline&prompt=consent` to obtain a refresh token with calendar scope.
4. Set the following in the gitignored `.env` file on Oracle Cloud:
   - `OMNYID_GCAL_CLIENT_SECRET=<client secret from Google Cloud Console>`
   - `OMNYID_GCAL_REFRESH_TOKEN=<offline refresh token>`
   - `OMNYID_GCAL_CALENDAR_ID=primary` (optional, default is `primary`)
5. The capability routes to the appropriate calendar via `OMNYID_CALENDAR_PROVIDER=google`.

The client secret must never be committed — it belongs in the gitignored `.env` only, consistent with the key separation policy.

## Deployment Notes

- `omnyid.com` is currently intended to stay behind preview auth until public launch.
- `api.omnyid.com` stays public for homeserver API access.
- If the frontend later moves from popup mode to redirect mode, the registered callback URLs above can be used without another console change.
