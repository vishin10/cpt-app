const test = require("node:test");
const assert = require("node:assert/strict");
const {
  workDateForDay, nonWorkingLabel, plannedWeekHours, nonWorkingViolations
} = require("../work-hours-policy.js");

const base = [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0];
// Fictional dates only: the real student's private leave calendar must never
// be copied to the public cpt-app GitHub Pages repository.
const calendar = { days_off: {
  "2030-02-05": "Approved leave",
  "2030-02-07": "Company holiday",
}};

test("maps dates without UTC timezone off-by-one errors", () => {
  assert.equal(workDateForDay("2030-02-04", 0), "2030-02-04");
  assert.equal(workDateForDay("2030-02-04", 1), "2030-02-05");
  assert.equal(workDateForDay("2030-02-04", 3), "2030-02-07");
});

test("day-off policy prefills zero without editing source values", () => {
  const proposed = base.slice();
  const safe = plannedWeekHours("2030-02-04", proposed, calendar);
  assert.deepEqual(safe, [7.5, 0, 7.5, 0, 7.5, 0, 0]);
  assert.equal(safe.reduce((a,b) => a + b, 0), 22.5);
  assert.deepEqual(proposed, base);
});

test("zero-hour days display the reason from private config", () => {
  assert.equal(nonWorkingLabel("2030-02-04", 1, calendar), "Approved leave");
  assert.equal(nonWorkingLabel("2030-02-04", 3, calendar), "Company holiday");
  assert.equal(nonWorkingLabel("2030-02-04", 2, calendar), "");
});

test("nonzero company holidays are rejected before approval", () => {
  const problems = nonWorkingViolations("2030-02-04", base, calendar);
  assert.deepEqual(problems.map(p => p.date), ["2030-02-05","2030-02-07"]);
  assert.equal(nonWorkingViolations(
    "2030-02-04", plannedWeekHours("2030-02-04", base, calendar), calendar
  ).length, 0);
});

test("no private calendar means ordinary Monday to Friday schedule", () => {
  assert.deepEqual(plannedWeekHours("2030-02-04", base, null), base);
});
