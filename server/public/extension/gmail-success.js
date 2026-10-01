(function () {
  var params = new URLSearchParams(location.search);
  var status = params.get("gmail") || "error";
  var extensionId = params.get("extensionId");

  var text = {
    connected: ["Gmail connected", "Returning to TrackTrail…"],
    no_refresh_token: ["Almost there", "Returning to TrackTrail…"],
    error: ["Couldn't connect Gmail", "Returning to TrackTrail…"]
  }[status] || ["Gmail", "Returning to TrackTrail…"];

  document.getElementById("title").textContent = text[0];
  document.getElementById("msg").textContent = text[1];

  // Only the configured TrackTrail extension ID can receive this message.
  // The extension validates that sender.url is this server's own origin.
  if (!extensionId || !/^[a-p]{32}$/.test(extensionId)) {
    document.getElementById("msg").textContent = "You can close this page.";
    return;
  }

  try {
    chrome.runtime.sendMessage(
      extensionId,
      { type: "TRACKTRAIL_GMAIL_OAUTH_COMPLETE", status: status },
      function () {
        if (chrome.runtime.lastError) {
          document.getElementById("msg").textContent =
            "TrackTrail extension was not available. You can close this page.";
        }
      }
    );
  } catch (e) {
    document.getElementById("msg").textContent =
      "TrackTrail extension was not available. You can close this page.";
  }
})();
