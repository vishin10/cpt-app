// Resolve the Due dates status for graded Canvas discussions from this week's
// read-only, verified Canvas posts and replies, not inferred assignment submissions.
// No network requests, Canvas posting or private state writes.
function normalizedDiscussionTitle(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function discussionDueStatus(data, dueItem, weekStart, defaultPeerReplies = 2) {
  const history = data && data.discussion_history;
  if (!history || history.week_start !== weekStart || !Array.isArray(history.items)) return null;

  // Match the course ID and full discussion name, never title alone. This
  // deliberately ignores ambiguous and unrelated / non-discussion assignments.
  const urlMatch = /^https:\/\/belhaven\.instructure\.com\/courses\/(\d+)\/assignments\/(\d+)(?:[/?#]|$)/.exec(
    String(dueItem && dueItem.url || "")
  );
  const title = normalizedDiscussionTitle(dueItem && dueItem.name);
  if (!urlMatch || !/\bdiscussion\b/.test(title)) return null;
  const courseId = urlMatch[1];
  const hits = history.items.filter(item =>
    item && item.verified === true &&
    String(item.course_id) === courseId &&
    normalizedDiscussionTitle(item.title) === title
  );
  if (hits.length !== 1) return null;
  const record = hits[0];
  const pending = (data.discussions || []).find(d =>
    String(d.course_id) === courseId && String(d.id) === String(record.id)
  );
  const initial = Array.isArray(record.initial_posts) && record.initial_posts.length > 0;
  const replies = (record.peer_replies || []).filter(r => r && r.is_peer_reply === true);
  const uniquePeers = new Set(replies.map(r =>
    r.recipient_user_id != null ? "user:" + r.recipient_user_id :
    r.recipient ? "name:" + String(r.recipient).trim().toLocaleLowerCase() : ""
  ).filter(Boolean)).size;
  const reported = Number(record.distinct_peers_replied_to);
  const done = Number.isFinite(reported) && reported >= 0 ?
    Math.max(uniquePeers, reported) : uniquePeers;
  const wanted = [Number(pending && pending.replies_needed),
                  Number(record.required_replies),
                  Number(defaultPeerReplies)]
    .find(n => Number.isInteger(n) && n > 0) || 2;

  if (!initial) {
    return { text: "Initial post needed", tone: "unk", completed: false, verified: true };
  }
  if (done >= wanted) {
    return { text: "Submitted ✓", tone: "good", completed: true,
             done, required: wanted, verified: true };
  }
  return {
    text: done + "/" + wanted + " replies", tone: "unk",
    completed: false, done, required: wanted, verified: true
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { discussionDueStatus, normalizedDiscussionTitle };
}
