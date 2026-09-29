// Verified deep links (Android App Links / iOS Universal Links).
//
// This server can host the association files itself, so no separate website is
// required. Nothing is fabricated: each file is only served when the values it
// needs are provided through environment variables (see .env.example).
//
//   /.well-known/assetlinks.json              needs ANDROID_SHA256_CERT_FINGERPRINTS
//   /.well-known/apple-app-site-association   needs APPLE_TEAM_ID
//   /app/reset-password?token=...             opens the app when installed; if the
//                                             app is not installed the browser lands
//                                             on the web reset page instead
const router = require("express").Router();

const ANDROID_PACKAGE = () => process.env.ANDROID_PACKAGE_NAME || "com.tracktrail.mobile";
const IOS_BUNDLE = () => process.env.IOS_BUNDLE_ID || "com.tracktrail.mobile";
const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);

router.get("/.well-known/assetlinks.json", (req, res) => {
  const fingerprints = list(process.env.ANDROID_SHA256_CERT_FINGERPRINTS);
  if (!fingerprints.length) return res.status(404).json({ message: "Not configured" });
  res.set("Cache-Control", "public, max-age=3600").json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: ANDROID_PACKAGE(), sha256_cert_fingerprints: fingerprints },
    },
  ]);
});

router.get("/.well-known/apple-app-site-association", (req, res) => {
  const team = (process.env.APPLE_TEAM_ID || "").trim();
  if (!team) return res.status(404).json({ message: "Not configured" });
  res.set("Cache-Control", "public, max-age=3600").type("application/json").send(
    JSON.stringify({
      applinks: {
        details: [{ appIDs: [`${team}.${IOS_BUNDLE()}`], components: [{ "/": "/app/*", comment: "TrackTrail in-app links" }] }],
      },
    }),
  );
});

// Web fallback for the emailed reset link when the app is not installed.
router.get("/app/reset-password", (req, res) => {
  const token = String(req.query.token || "");
  const clientUrl = (process.env.CLIENT_URL || "").split(",")[0].trim().replace(/\/+$/, "");
  if (!clientUrl || !/^[A-Za-z0-9._-]{20,2000}$/.test(token)) return res.status(404).type("text/plain").send("Link not available");
  res.redirect(302, `${clientUrl}/reset-password?token=${encodeURIComponent(token)}`);
});

module.exports = router;
