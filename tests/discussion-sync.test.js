const test = require("node:test");
const assert = require("node:assert/strict");
const { verifiedDiscussionStatus } = require("../discussion-sync.js");

const week = "2026-10-26";
const data = {
  discussion_history: { week_start: week, items: [
    { course_id: 51987, id: 634709, verified: true, distinct_peers_replied_to: 1,
      peer_replies: [{ reply_to_entry_id: 5309749, recipient: "Sri Vatsava Budambu",
        recipient_user_id: "85980", is_peer_reply: true }] },
    { course_id: 51987, id: 634688, verified: true, distinct_peers_replied_to: 2,
      peer_replies: [
        { reply_to_entry_id: 5308925, recipient: "Pradeep Mittapalli",
          recipient_user_id: "85998", is_peer_reply: true },
        { reply_to_entry_id: 5309757, recipient: "Sri Vatsava Budambu",
          recipient_user_id: "85980", is_peer_reply: true }
      ] },
  ] }
};

test("Question 1 excludes already-sent reply to Sri and keeps Pradeep / Anuhya", () => {
  const discussion = { course_id: 51987, id: 634709, posted: true,
    replies_needed: 2, replies_done: 1, reply_drafts: [
      { entry_id: 5308860, to: "Pradeep Mittapalli" },
      { entry_id: 5309749, to: "Sri Vatsava Budambu" },
      { entry_id: 5309766, to: "Anuhya Chebrolu" }
    ]
  };
  const result = verifiedDiscussionStatus(data, discussion, week);
  assert.equal(result.count, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.pending.map(x => x.entry_id), [5308860, 5309766]);
});

test("Question 2 disappears when two unique peers have verified replies", () => {
  const d = { course_id: 51987, id: 634688, posted: true,
    replies_needed: 2, replies_done: 0, reply_drafts: [
      { entry_id: 5308925, to: "Pradeep Mittapalli" },
      { entry_id: 5309757, to: "Sri Vatsava Budambu" }
    ]
  };
  const result = verifiedDiscussionStatus(data, d, week);
  assert.equal(result.count, 2);
  assert.equal(result.complete, true);
  assert.equal(result.pending.length, 0);
});

test("unverified and old weekly history cannot suppress drafts", () => {
  const d = { course_id: 51987, id: 634709, posted: true, replies_needed: 2,
    replies_done: 0, reply_drafts: [{ entry_id: 5309749, to: "Sri Vatsava Budambu" }] };
  const old = verifiedDiscussionStatus(data, d, "2026-10-19");
  assert.equal(old.verified, false);
  assert.equal(old.pending.length, 1);
  const unverified = structuredClone(data);
  unverified.discussion_history.items[0].verified = false;
  assert.equal(verifiedDiscussionStatus(unverified, d, week).pending.length, 1);
});
