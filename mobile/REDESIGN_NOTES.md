# TrackTrail Mobile — Redesign Integration Notes

This documents what changed in this pass and exactly what to do to run it.

## 1. Install new dependencies

```bash
cd mobile
npx expo install @react-native-async-storage/async-storage @react-navigation/drawer @react-navigation/native react-native-svg
```

(`package.json` already lists them; the command above just gets Expo to
resolve SDK-compatible versions and install native code where needed.)

## 2. Rebuild native code if you use dev builds / EAS

`@react-navigation/drawer` and `react-native-svg` include native modules.
If you run via Expo Go this "just works" for SVG and Drawer's JS parts;
if you use a custom dev client or EAS build, run a new native build:

```bash
npx expo prebuild --clean   # if you manage native projects locally
# or
eas build --profile development
```

## 3. What moved / was renamed

- `app/(tabs)/*` → `app/(drawer)/(tabs)/*` (all URLs unchanged — group
  folders never appear in the URL, so every existing `router.push('/jobs')`
  etc. still works).
- `app/(tabs)/applications.tsx` → `app/applications.tsx`, now a top-level
  Stack screen titled "Job Tracker" with a native back button, reachable
  from the drawer, from Home's "Recent applications"/"Upcoming interviews"
  sections, and from anywhere that already linked to `/applications`.
- Bottom tabs are now exactly: **Home, Jobs, Analytics, Notifications, Profile**.

## 4. New architecture pieces

| Piece | File(s) |
|---|---|
| Theme (light/dark/system, persisted) | `context/ThemeContext.tsx`, `hooks/use-theme*.ts`, `hooks/use-color-scheme*.ts` |
| Drawer navigation | `app/(drawer)/_layout.tsx`, `components/drawer-content.tsx` |
| Notifications | `context/NotificationContext.tsx`, `services/notifications.ts`, `types/notifications.ts`, `hooks/use-notifications.ts`, `hooks/use-notification-preferences.ts` |
| Saved Jobs | `services/savedJobs.ts`, `hooks/use-saved-jobs.ts` |
| Reusable UI | `components/card.tsx`, `button.tsx`, `avatar.tsx`, `search-bar.tsx`, `screen-header.tsx`, `dashboard-header.tsx`, `theme-toggle.tsx`, `notification-item.tsx`, `charts/bar-chart.tsx`, `charts/donut-chart.tsx` |
| New screens | Dashboard (redesigned `index.tsx`), `notifications.tsx`, `(drawer)/resume-insights.tsx`, `saved-jobs.tsx`, `help.tsx`, `about.tsx`, `legal/privacy.tsx`, `legal/terms.tsx`; Settings redesigned |

## 5. Honest limitations (by design, not oversight)

- **Push notifications**: there's no Expo push-token registration
  endpoint on your backend, so Settings' Push/Email toggles are
  device-local preferences that gate the in-app Notifications tab only.
  Wiring true push needs `expo-notifications` + a backend table/route for
  tokens — out of scope here, but the toggle UI and notification model
  are ready for it.
- **Saved Jobs**: stored on-device (AsyncStorage) since there's no
  bookmark endpoint on the backend.
- **Change Password**: there's no "change password while logged in"
  endpoint, so Settings reuses the existing forgot-password email flow.
- **Privacy Policy / Terms**: placeholder copy — replace before shipping.
- **NativeTabs badge**: the unread-notifications badge is shown in the
  Dashboard's bell icon and the Notifications tab itself, not as a native
  badge dot on the tab bar icon — `expo-router/unstable-native-tabs`'s
  badge API varies by SDK version and wasn't something I could verify
  without your exact installed version; safe to add later.

## 6. Design conventions followed

New components use the same kebab-case flat-file convention as the rest
of `components/` (not nested `Card/`, `Button/` folders) to stay
consistent with the existing codebase, with one exception: `components/charts/`
groups the two chart primitives since they're a genuinely new category.
