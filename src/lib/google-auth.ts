import { OAuth2Client, GoogleAuth } from 'google-auth-library';

export const GOOGLE_CALENDAR_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
] as const;

export function getGoogleOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !redirectUri || !refreshToken) {
    throw new Error(
      'Missing Google OAuth env (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_REDIRECT_URI, GOOGLE_OAUTH_REFRESH_TOKEN)'
    );
  }

  const oauth2 = new OAuth2Client(clientId, clientSecret, redirectUri);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

export function getGoogleServiceAccountAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY');
  }
  return new GoogleAuth({
    credentials: {
      client_email: email,
      private_key: key,
    },
    scopes: [...GOOGLE_CALENDAR_SCOPES],
  });
}

/**
 * Prefer OAuth (Solution 2) if configured; fallback to service account if not.
 * This lets you keep service-account availability while migrating, but for Meet links you want OAuth.
 */
export function getCalendarAuthClient() {
  const hasOAuth =
    !!process.env.GOOGLE_OAUTH_CLIENT_ID &&
    !!process.env.GOOGLE_OAUTH_CLIENT_SECRET &&
    !!process.env.GOOGLE_OAUTH_REDIRECT_URI &&
    !!process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (hasOAuth) return getGoogleOAuthClient();
  return getGoogleServiceAccountAuth();
}

