// Pure client-side hours helpers; work dates come only from private config.json.
// This public repository must not contain the student's PTO calendar.
function workDateForDay(week, index) {
  const d = new Date(week + "T12:00:00");
  d.setDate(d.getDate() + index);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

function nonWorkingLabel(week, index, calendar) {
  return (calendar && calendar.days_off || {})[workDateForDay(week, index)] || "";
}

function plannedWeekHours(week, hours, calendar) {
  return Array.from({length: 7}, (_, i) => nonWorkingLabel(week, i, calendar)
    ? 0 : Number((hours || [])[i] ?? 0));
}

function nonWorkingViolations(week, hours, calendar) {
  return Array.from({length: 7}, (_, i) => ({
    date: workDateForDay(week, i), reason: nonWorkingLabel(week, i, calendar),
    hours: Number((hours || [])[i] ?? 0)
  })).filter(x => x.reason && x.hours !== 0);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {workDateForDay, nonWorkingLabel, plannedWeekHours, nonWorkingViolations};
}
