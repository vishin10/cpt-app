// Current-week Canvas discussion history, read-only. Loaded after app.js.
"use strict";
(() => {
  const root = document.getElementById("discHistory");
  const note = document.getElementById("discHistoryNote");
  const fetchButton = document.getElementById("discHistoryBtn");
  if (!root || !note || !fetchButton) return;
  let lastKey = "";

  const detail = (parent, title, message) => {
    const disclosure = document.createElement("details");
    const label = document.createElement("summary");
    label.textContent = title;
    const body = document.createElement("div");
    body.className = "prompt";
    body.style.whiteSpace = "pre-wrap";
    body.textContent = message || "(No text available)";
    disclosure.append(label, body);
    parent.append(disclosure);
  };

  function renderHistory() {
    if (typeof state === "undefined" || !state) return;
    const history = state.discussion_history;
    const currentMonday = weekKey();
    const fingerprint = history
      ? [history.checked_at, history.week_start, currentMonday].join("|")
      : "empty|" + currentMonday;
    if (lastKey === fingerprint) return;
    lastKey = fingerprint;
    root.replaceChildren();

    if (!history || history.week_start !== currentMonday) {
      root.textContent = "Not yet checked for the current week.";
      note.textContent = "Fetch this week to verify Canvas posts and replies. Duo may be required.";
      return;
    }
    const entries = history.items || [];
    note.textContent = history.week_start + " through " + history.week_end
      + " · Checked " + fmt(history.checked_at)
      + ((history.warnings || []).length ? " · Some Canvas results could not be verified" : "");
    if (!entries.length) {
      root.textContent = "No graded discussions due or answered this week were found.";
    }
    for (const item of entries) {
      const card = document.createElement("div");
      card.className = "disc";
      const heading = document.createElement("h3");
      heading.textContent = (item.course || "Course") + " · " + (item.title || "Discussion");
      card.append(heading);

      const status = document.createElement("div");
      status.className = "sub";
      const own = item.initial_posts || [];
      const replies = item.peer_replies || [];
      const peerReplies = replies.filter(r => r.is_peer_reply);
      const distinct = item.distinct_peers_replied_to ?? new Set(
        peerReplies.map(r => r.recipient_user_id).filter(Boolean)
      ).size;
      const requirement = item.required_replies || "unknown";
      status.textContent = item.verified
        ? "Initial posts: " + own.length + " · Peer replies: " + distinct + "/" + requirement + " classmates"
        : "Canvas verification unavailable — do not assume this is missing";
      if (item.due_at) status.textContent += " · Due " + fmt(item.due_at);
      card.append(status);

      detail(card, "Instructor question", item.question);
      for (const post of own) {
        detail(card, "Your submitted post · " + (post.created_at ? fmt(post.created_at) : "time unknown"),
          post.message_text);
      }
      for (const reply of replies) {
        const whom = reply.recipient || "classmate";
        detail(card, "Your reply to " + whom + " · " + (reply.created_at ? fmt(reply.created_at) : "time unknown"),
          reply.message_text);
      }
      if (item.error) {
        const warning = document.createElement("p");
        warning.className = "smallnote";
        warning.textContent = item.error;
        card.append(warning);
      }
      if (item.url && item.url.startsWith("https://belhaven.instructure.com/")) {
        const link = document.createElement("a");
        link.className = "btn ghost";
        link.textContent = "Open in Canvas";
        link.href = item.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        card.append(link);
      }
      root.append(card);
    }
  }

  fetchButton.addEventListener("click", () => {
    // Reuse the existing workflow action. It requests both pending drafts and
    // read-only current-week submission history in a single authenticated run.
    act({ action: "discussions" },
      "Checking this week's discussion submissions. Approve Duo if requested.");
  });
  renderHistory();
  setInterval(renderHistory, 2000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) renderHistory();
  });
})();
