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

## Deployment Notes

- `omnyid.com` is currently intended to stay behind preview auth until public launch.
- `api.omnyid.com` stays public for homeserver API access.
- If the frontend later moves from popup mode to redirect mode, the registered callback URLs above can be used without another console change.
