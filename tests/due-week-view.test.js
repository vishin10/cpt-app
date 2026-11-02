const test = require("node:test");
const assert = require("node:assert/strict");
const {previousMonday, groupDueDates} = require("../due-week-view.js");

const monday = "2026-11-02";
const make = (id, due, done=false) => ({
  id, name: "Unit " + id + " Assignment",
  url: "https://belhaven.instructure.com/courses/999/assignments/" + id,
  due, done
});
const getWeek = d => {
  // Match the PWA's existing Monday based week grouping for New York dates.
  const dt = new Date(d.toLocaleString("en-US", {timeZone:"America/New_York"}));
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dt.getFullYear() + "-" + String(dt.getMonth()+1).padStart(2,"0") +
    "-" + String(dt.getDate()).padStart(2,"0");
};
const done = item => item.done;

test("new Monday shows pending current week and later work, not submitted items", () => {
  const current = [make(4, "2026-11-07T23:59:00-05:00"),
                   make(5, "2026-11-07T23:59:00-05:00", true),
                   make(6, "2026-11-14T23:59:00-05:00")];
  const previous = [make(1,"2026-10-31T23:59:00-04:00", true),
                    make(2,"2026-10-31T23:59:00-04:00", true)];
  const groups = groupDueDates(current, previous, monday, getWeek, done);
  assert.deepEqual(groups.current.map(i=>i.id), [4]);
  assert.deepEqual(groups.future.map(i=>i.id), [6]);
  assert.deepEqual(groups.currentSubmitted.map(i=>i.id), [5]);
  assert.deepEqual(groups.lastSubmitted.map(i=>i.id), [1, 2]);
  assert.equal(groups.overdue.length, 0);
});

test("incomplete prior week remains visible as overdue rather than disappeared", () => {
  const groups = groupDueDates([], [
    make(1, "2026-10-31T23:59:00-04:00", false),
    make(2, "2026-10-31T23:59:00-04:00", true)
  ], monday, getWeek, done);
  assert.deepEqual(groups.overdue.map(i => i.id), [1]);
  assert.deepEqual(groups.lastSubmitted.map(i => i.id), [2]);
});

test("duplicate items in archive and upcoming are not repeated", () => {
  const archive = [make(2, "2026-10-31T23:59:00-04:00", true)];
  const groups = groupDueDates(archive, archive, monday, getWeek, done);
  assert.equal(groups.lastSubmitted.length, 1);
});

test("submitted future assignment never distracts from current work", () => {
  const groups = groupDueDates([
    make(5, "2026-11-07T23:59:00-05:00"),
    make(6, "2026-11-14T23:59:00-05:00", true)
  ], [], monday, getWeek, done);
  assert.deepEqual(groups.current.map(i=>i.id), [5]);
  assert.deepEqual(groups.future, []);
});

test("last week computation follows Monday at year rollover and DST", () => {
  assert.equal(previousMonday("2026-11-02"), "2026-10-26");
  assert.equal(previousMonday("2027-01-04"), "2026-12-28");
});

test("unverified statuses are not considered completed", () => {
  const groups = groupDueDates([make(5, "2026-11-07T23:59:00-05:00")],
    [], monday, getWeek, () => false);
  assert.equal(groups.current.length, 1);
  assert.equal(groups.currentSubmitted.length, 0);
});
