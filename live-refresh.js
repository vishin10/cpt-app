// Keep the installed iPhone PWA up to date while it is open.
// All private data still comes directly from the authenticated private GitHub repo.
"use strict";
(() => {
  let inFlight = false;
  async function syncVisibleState() {
    if (inFlight || document.hidden || !navigator.onLine || !token || pollTimer) return;
    inFlight = true;
    try {
      await refresh();
    } finally {
      inFlight = false;
    }
  }
  // The existing short polling continues immediately after a button action.
  // Outside those windows, pick up newly saved Canvas state within about a minute.
  setInterval(syncVisibleState, 60000);
  window.addEventListener("focus", syncVisibleState);
})();
