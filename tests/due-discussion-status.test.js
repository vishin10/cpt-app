const test = require("node:test");
const assert = require("node:assert/strict");
const { discussionDueStatus } = require("../due-discussion-status.js");

const week = "2026-10-26";
const baseUrl = "https://belhaven.instructure.com/courses/51987/assignments/";
const due1 = { id: 988729, url: baseUrl + "988729", name: "Unit 3: Discussion Question 1",
  due: "2026-10-31T23:59:00-04:00" };
const due2 = { id: 988705, url: baseUrl + "988705", name: "Unit 3: Discussion Question 2",
  due: "2026-10-31T23:59:00-04:00" };

function current() {
  return {
    discussion_history: {
      week_start: week, checked_at: "2026-10-30T00:42:00-04:00",
      items: [
        { id: 634709, course_id: 51987, title: due1.name, verified: true,
          initial_posts: [{ entry_id: 100 }], distinct_peers_replied_to: 1,
          required_replies: 0, peer_replies: [
            { is_peer_reply: true, recipient_user_id: 85980 }
          ] },
        { id: 634688, course_id: 51987, title: due2.name, verified: true,
          initial_posts: [{ entry_id: 101 }], distinct_peers_replied_to: 2,
          required_replies: 0, peer_replies: [
            { is_peer_reply: true, recipient_user_id: 85998 },
            { is_peer_reply: true, recipient_user_id: 85980 }
          ] }
      ]
    },
    discussions: [
      { id: 634709, course_id: 51987, posted: true, replies_needed: 2, replies_done: 1 }
    ]
  };
}

test("BUS 719 Question 1 is partial, never fully submitted at one of two", () => {
  const status = discussionDueStatus(current(), due1, week);
  assert.equal(status.text, "1/2 replies");
  assert.equal(status.completed, false);
  assert.equal(status.verified, true);
});

test("BUS 719 Question 2 is Submitted after verified initial and two peers", () => {
  const status = discussionDueStatus(current(), due2, week);
  assert.equal(status.text, "Submitted ✓");
  assert.equal(status.tone, "good");
  assert.equal(status.completed, true);
});

test("do not replace status for unrelated writing assignments", () => {
  const item = { id: 988895, name: "Unit 3: Writing Assignment",
    url: baseUrl + "988895" };
  assert.equal(discussionDueStatus(current(), item, week), null);
});

test("do not treat other weeks' or future discussion statuses as verified", () => {
  assert.equal(discussionDueStatus(current(), due1, "2026-11-02"), null);
  const s = current();
  s.discussion_history.week_start = "2026-10-19";
  assert.equal(discussionDueStatus(s, due1, week), null);
});

test("never mark a discussion submitted if Canvas could not verify it", () => {
  const s = current();
  s.discussion_history.items[1].verified = false;
  assert.equal(discussionDueStatus(s, due2, week), null);
});

test("matching must include course ID and full title", () => {
  const wrongCourse = { ...due2,
    url: "https://belhaven.instructure.com/courses/51925/assignments/988705" };
  assert.equal(discussionDueStatus(current(), wrongCourse, week), null);
  assert.equal(discussionDueStatus(current(), { ...due2, name: "Unit 5: Discussion Question 2" }, week), null);
});

test("duplicate ambiguous topic names are never auto marked submitted", () => {
  const s = current();
  s.discussion_history.items.push({ ...s.discussion_history.items[1], id: 898989 });
  assert.equal(discussionDueStatus(s, due2, week), null);
});

test("a submitted initial post without required replies displays progress only", () => {
  const s = current();
  s.discussion_history.items[1].distinct_peers_replied_to = 0;
  s.discussion_history.items[1].peer_replies = [];
  assert.equal(discussionDueStatus(s, due2, week).text, "0/2 replies");
});

test("must verify initial post before declaring fully submitted", () => {
  const s = current();
  s.discussion_history.items[1].initial_posts = [];
  const status = discussionDueStatus(s, due2, week);
  assert.equal(status.completed, false);
  assert.equal(status.text, "Initial post needed");
});

test("duplicate replies to one classmate count as just one peer", () => {
  const s = current();
  s.discussion_history.items[1].distinct_peers_replied_to = 1;
  s.discussion_history.items[1].peer_replies = [
    { is_peer_reply: true, recipient_user_id: 85998 },
    { is_peer_reply: true, recipient_user_id: 85998 }
  ];
  assert.equal(discussionDueStatus(s, due2, week).text, "1/2 replies");
});

test("explicitly required three replies should override the normal default of two", () => {
  const s = current();
  s.discussion_history.items[1].required_replies = 3;
  assert.equal(discussionDueStatus(s, due2, week).text, "2/3 replies");
});

test("unrecognized hostname is not trusted for Canvas course matching", () => {
  const item = { ...due2, url: "https://not-canvas.example/courses/51987/assignments/988705" };
  assert.equal(discussionDueStatus(current(), item, week), null);
});
