// Split the Due dates page into active work, completed work, and last week.
// Only the caller's verified completion check determines "submitted".
function previousMonday(currentMonday) {
  const d = new Date(currentMonday + "T12:00:00");
  d.setDate(d.getDate() - 7);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") +
    "-" + String(d.getDate()).padStart(2, "0");
}

function groupDueDates(upcomingItems, lastWeekItems, monday, getWeek, completed) {
  const previous = previousMonday(monday);
  const groups = {
    current: [], currentSubmitted: [], future: [],
    lastSubmitted: [], overdue: []
  };
  const seen = new Set();
  for (const item of [...(lastWeekItems || []), ...(upcomingItems || [])]) {
    if (!item || !item.due) continue;
    const id = String(item.url || "") + "|" + String(item.id || "");
    if (seen.has(id)) continue;
    seen.add(id);
    const week = getWeek(new Date(item.due));
    const done = completed(item);
    if (week === previous) {
      groups[done ? "lastSubmitted" : "overdue"].push(item);
    } else if (week === monday) {
      groups[done ? "currentSubmitted" : "current"].push(item);
    } else if (week > monday) {
      if (!done) groups.future.push(item);
    }
  }
  for (const values of Object.values(groups)) {
    values.sort((a, b) => a.due.localeCompare(b.due) ||
      String(a.name || "").localeCompare(String(b.name || "")));
  }
  return groups;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {previousMonday, groupDueDates};
}
