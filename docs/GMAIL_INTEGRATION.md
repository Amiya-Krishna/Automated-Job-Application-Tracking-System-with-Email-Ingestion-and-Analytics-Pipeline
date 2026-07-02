# Gmail Integration Setup

Lets a logged-in user connect their Gmail (read-only) and scan for recent
interview/offer/rejection emails, turning each one into a job entry with
one click. This requires **your own** Google OAuth credentials — Google
ties OAuth clients to a specific Google account/project, so this can't be
pre-provisioned for you.

## 1. Create a Google Cloud project (free)

1. Go to https://console.cloud.google.com/ and create a new project (or
   use an existing one).

## 2. Enable the Gmail API

1. In the left sidebar: **APIs & Services → Library**.
2. Search for **Gmail API** and click **Enable**.

## 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** (unless you have a Google Workspace org).
3. Fill in app name ("TrackTrail"), your email as support contact.
4. Scopes: add `.../auth/gmail.readonly`.
5. Test users: while the app is in "Testing" mode, add the Gmail
   address(es) you'll log in with — Google only allows listed test users
   until you submit for verification (not required for a demo/portfolio
   project).

## 4. Create OAuth client credentials

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Authorized redirect URIs — add your **backend** URL + `/api/gmail/callback`:
   - Local dev: `http://localhost:5000/api/gmail/callback`
   - Production: `https://your-backend.onrender.com/api/gmail/callback`
4. Save. Copy the **Client ID** and **Client Secret**.

## 5. Add credentials to `server/.env`

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=https://your-backend.onrender.com/api/gmail/callback
```

Also set the same three variables in your Render dashboard's environment
variables (Render doesn't read your local `.env` file).

## 6. Try it

1. Redeploy the backend so it picks up the new env vars.
2. In the app, go to **Integrations** in the nav bar → **Connect Gmail**.
3. Approve access with a test-user Gmail account.
4. Click **Scan inbox** — it looks at the last 30 days for messages
   matching interview/application/offer/rejection keywords and lets you
   add each one to your pipeline with one click.

## What data this touches

- Scope requested: `gmail.readonly` — TrackTrail can never send, delete,
  or modify anything in the inbox.
- Only message **subject, sender, date, and snippet** are read — never the
  full email body.
- Nothing from Gmail is stored in the database; only the refresh token
  (used to re-authenticate future scans) is saved, and only for the
  logged-in user who connected it.
- Disconnecting (via the Integrations page) deletes that refresh token
  immediately.
