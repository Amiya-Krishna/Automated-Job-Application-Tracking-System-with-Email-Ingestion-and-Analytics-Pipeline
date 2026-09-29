/**
 * Environment-aware Expo config. Static values live in app.json; this file only
 * layers on what depends on the build environment, so nothing secret or
 * environment-specific is ever committed.
 *
 * Build-time variables (set in eas.json `env` or as EAS environment variables):
 *   EXPO_PUBLIC_APP_ENV        development | staging | production
 *   EXPO_PUBLIC_API_URL        https:// URL of the API (required for staging/production)
 *   APP_LINK_HOST              optional; host for verified https deep links.
 *                              Defaults to the host of EXPO_PUBLIC_API_URL because the
 *                              API server hosts the association files.
 *   GOOGLE_SERVICES_JSON       path to google-services.json (EAS "file" variable) — needed
 *                              for Android push (FCM). Never commit this file.
 *   SENTRY_ORG / SENTRY_PROJECT (+ SENTRY_AUTH_TOKEN as an EAS secret) — enables source map upload.
 */
import type { ConfigContext, ExpoConfig } from 'expo/config';

const APP_ENV = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';
const isReleaseBuild = APP_ENV === 'staging' || APP_ENV === 'production';

function apiHost(url: string | undefined): string | null {
  try {
    return url ? new URL(url).host : null;
  } catch {
    return null;
  }
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;

  // Fail the BUILD (not the user's first launch) when a release build would ship
  // pointing at a missing or insecure API.
  if (isReleaseBuild) {
    if (!apiUrl || !/^https:\/\//i.test(apiUrl)) {
      throw new Error(
        `EXPO_PUBLIC_API_URL must be set to an https:// URL for ${APP_ENV} builds ` +
          `(eas env:create --environment ${APP_ENV} --name EXPO_PUBLIC_API_URL ...).`,
      );
    }
  }

  const linkHost = process.env.APP_LINK_HOST || apiHost(apiUrl);
  const httpsLinks = isReleaseBuild && linkHost && /^[a-z0-9.-]+(:\d+)?$/i.test(linkHost);

  const plugins: NonNullable<ExpoConfig['plugins']> = [...(config.plugins ?? [])];
  plugins.push([
    'expo-build-properties',
    {
      // Production traffic is HTTPS-only on Android; cleartext is allowed only in dev builds.
      android: { usesCleartextTraffic: !isReleaseBuild },
      ios: { deploymentTarget: '16.4' },
    },
  ]);
  if (process.env.SENTRY_ORG && process.env.SENTRY_PROJECT) {
    plugins.push([
      '@sentry/react-native/expo',
      { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT },
    ]);
  }

  return {
    ...config,
    name: config.name ?? 'TrackTrail',
    slug: config.slug ?? 'mobile',
    plugins,
    ios: {
      ...config.ios,
      ...(httpsLinks ? { associatedDomains: [`applinks:${linkHost}`] } : {}),
    },
    android: {
      ...config.android,
      ...(process.env.GOOGLE_SERVICES_JSON ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON } : {}),
      intentFilters: httpsLinks
        ? [
            {
              action: 'VIEW',
              autoVerify: true,
              data: [{ scheme: 'https', host: linkHost as string, pathPrefix: '/app' }],
              category: ['BROWSABLE', 'DEFAULT'],
            },
          ]
        : undefined,
    },
    extra: { ...config.extra, appEnv: APP_ENV },
  };
};
