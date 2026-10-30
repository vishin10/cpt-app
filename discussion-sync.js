// Reconcile pending drafts with Canvas-verified read-only discussion history.
// No Canvas mutation. This module is pure and can be unit-tested with Node.
function verifiedDiscussionStatus(data, discussion, weekStart) {
  const history = data && data.discussion_history;
  const item = history && history.week_start === weekStart
    ? (history.items || []).find(x => String(x.course_id) === String(discussion.course_id) &&
        String(x.id) === String(discussion.id) && x.verified === true)
    : null;
  const replies = item ? (item.peer_replies || []).filter(x => x.is_peer_reply) : [];
  const peers = new Set(replies.map(x => String(x.recipient_user_id || "")).filter(Boolean));
  const roots = new Set(replies.map(x => String(x.reply_to_entry_id || "")).filter(Boolean));
  const names = new Set(replies.map(x => String(x.recipient || "").trim().toLocaleLowerCase())
    .filter(x => x && x !== "classmate"));

  const replied = (r) => (
    roots.has(String(r.entry_id)) ||
    (r.author_user_id != null && peers.has(String(r.author_user_id))) ||
    (r.author_user_id == null && names.has(String(r.to || "").trim().toLocaleLowerCase()))
  );
  const count = Math.max(
    Number(discussion.replies_done || 0),
    item ? Math.max(peers.size, Number(item.distinct_peers_replied_to || 0)) : 0
  );
  const required = Number(discussion.replies_needed || 0);
  return {
    count, required, complete: !!discussion.posted && required > 0 && count >= required,
    pending: (discussion.reply_drafts || []).filter(r => !r.done && !replied(r)),
    verified: !!item
  };
}
if (typeof module !== "undefined" && module.exports) module.exports = {verifiedDiscussionStatus};
