// Current-week Canvas discussion history, read-only. Loaded after app.js.
"use strict";
(() => {
  const root = document.getElementById("discHistory");
  const note = document.getElementById("discHistoryNote");
  const fetchButton = document.getElementById("discHistoryBtn");
  if (!root || !note || !fetchButton) return;
  let lastKey = "";

  // An edit is always a draft until the user approves updating the same Canvas ID.
  const revisionEditors = new Map();
  const replyKey = (item, reply) => String(item.course_id) + ":" +
    String(item.id) + ":" + String(reply.entry_id);

  function actionButton(title, kind) {
    const control = document.createElement("button");
    control.type = "button";
    control.textContent = title;
    control.className = kind === "approve" ? "btn" : "btn secondary";
    return control;
  }

  function submittedReplyBox(item, reply) {
    const box = document.createElement("div");
    box.className = "disc";
    const who = reply.recipient || "classmate";
    const label = document.createElement("div");
    label.className = "smallnote";
    const eligible = !!(item.verified && reply.is_peer_reply && reply.entry_id != null);
    label.textContent = eligible ? "Submitted ✓ · Reply to " + who : "Your reply to " + who;
    box.append(label);
    detail(box, "View submitted reply · " + (reply.updated_at &&
      reply.updated_at !== reply.created_at ? "Updated " + fmt(reply.updated_at) :
      (reply.created_at ? fmt(reply.created_at) : "time unknown")), reply.message_text);
    if (!eligible) return box;

    const key = replyKey(item, reply);
    const controls = document.createElement("div");
    controls.className = "btnrow";
    const edit = actionButton("Edit Submitted Reply");
    const regenerate = actionButton("Regenerate Revision");
    controls.append(edit, regenerate);
    box.append(controls);
    const revision = (state.discussion_revisions || {})[key];
    const editor = revisionEditors.get(key);
    if (editor) {
      if (editor.mode === "regenerating" && revision &&
          revision.updated_at !== editor.originalRevisionStamp) {
        editor.value = revision.text;
        editor.mode = "editing";
      }
      const form = document.createElement("div");
      form.className = "draftbox";
      const note = document.createElement("p");
      note.className = "smallnote";
      note.textContent = "This will edit your existing Canvas reply, not create another. " +
        "Review your wording and citations before approval.";
      const field = document.createElement("textarea");
      field.className = "draft reply";
      field.rows = 8;
      field.value = editor.value || "";
      field.setAttribute("aria-label", "Edit submitted reply to " + who);
      field.addEventListener("input", () => { editor.value = field.value; });
      const approve = actionButton("Approve & Update Existing Reply", "approve");
      const cancel = actionButton("Cancel Revision");
      cancel.className = "btn ghost";
      approve.addEventListener("click", async () => {
        const body = editor.value || "";
        if (body.trim().length < 30 || body.length > 9000) {
          alert("Revised reply must contain 30–9000 characters.");
          return;
        }
        if (!confirm("Update your existing Canvas reply to " + who +
              "?\n\nThis edits the submitted reply, NOT a new post. Review citations first.")) return;
        const current = (state.discussion_revisions || {})[key];
        const base = current ? current.text : reply.message_text;
        approve.disabled = true;
        try {
          await dispatch({
            action: "disc_submit",
            payload: JSON.stringify({
              kind: "edit_reply", course_id: item.course_id,
              topic_id: item.id, entry_id: reply.entry_id, body,
              draft_hash: await sha256Text(base || ""),
              source_html_hash: await sha256Text(reply.message_html || "")
            })
          });
          $("busyBanner").classList.remove("hidden");
          $("busyBanner").textContent =
            "Updating existing reply only. Approve Duo if requested; then verify Canvas.";
          startPolling(true);
        } catch (error) {
          alert("Couldn't request the edit: " + error.message);
          approve.disabled = false;
        }
      });
      cancel.addEventListener("click", () => {
        revisionEditors.delete(key);
        lastKey = "";
        renderHistory();
      });
      form.append(note, field, approve, cancel);
      if (editor.mode === "regenerating") {
        const progress = document.createElement("p");
        progress.className = "smallnote";
        progress.textContent = "Regenerating a draft; published Canvas reply is unchanged.";
        form.append(progress);
      }
      box.append(form);
    }
    edit.addEventListener("click", () => {
      if (!revisionEditors.has(key)) {
        revisionEditors.set(key, {
          value: revision ? revision.text : (reply.message_text || ""),
          mode: "editing"
        });
      }
      lastKey = "";
      renderHistory();
    });
    regenerate.addEventListener("click", async () => {
      const note = prompt("What should change? Leave blank for a fresh, natural revision.", "");
      if (note === null) return;
      const stored = (state.discussion_revisions || {})[key];
      revisionEditors.set(key, {
        value: stored ? stored.text : (reply.message_text || ""),
        mode: "regenerating",
        originalRevisionStamp: stored ? stored.updated_at : ""
      });
      lastKey = "";
      renderHistory();
      try {
        regenerate.disabled = true;
        await dispatch({
          action: "disc_revision",
          payload: JSON.stringify({
            course_id: item.course_id, topic_id: item.id, entry_id: reply.entry_id, note
          })
        });
        $("busyBanner").classList.remove("hidden");
        $("busyBanner").textContent =
          "Generating a new revision. Your posted reply has NOT been changed.";
        startPolling(true);
      } catch (error) {
        alert("Couldn't regenerate: " + error.message);
      } finally {
        regenerate.disabled = false;
      }
    });
    return box;
  }


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
      ? [history.checked_at, history.week_start, currentMonday,
          JSON.stringify(Object.entries(state.discussion_revisions || {})
            .map(([k, v]) => [k, v.updated_at]).sort())].join("|")
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
      const pending = (state.discussions || []).find(d =>
        String(d.course_id) === String(item.course_id) && String(d.id) === String(item.id));
      const required = Number(item.required_replies || pending?.replies_needed ||
        config?.default_discussion_replies || 2);
      const completed = own.length > 0 && distinct >= required;
      status.textContent = item.verified
        ? (completed ? "Submitted ✓ · " + distinct + "/" + required + " peer replies"
          : "Initial post submitted · " + distinct + "/" + required +
            " replies submitted" + (required > distinct ? " · " + (required - distinct) + " remaining" : ""))
        : "Canvas verification unavailable — do not assume this is missing";
      if (item.due_at) status.textContent += " · Due " + fmt(item.due_at);
      card.append(status);

      detail(card, "Instructor question", item.question);
      for (const post of own) {
        detail(card, "Your submitted post · " + (post.created_at ? fmt(post.created_at) : "time unknown"),
          post.message_text);
      }
      for (const reply of replies) {
        card.append(submittedReplyBox(item, reply));
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
