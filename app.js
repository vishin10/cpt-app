// CPT Hours - iPhone home-screen app for the GitHub Actions CPT agent.
// Reads state.json from the private repo and starts the workflow with button actions.
"use strict";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WORKFLOW = "cpt-agent.yml";
const $ = (id) => document.getElementById(id);

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

let token = store.get("cpt_token");
let repo = store.get("cpt_repo") || "vishin10/cpt_agent";
let state = null, config = null, pollTimer = null, pollUntil = 0;

// ---------------------------------------------------------------- GitHub API
async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    cache: "no-store",
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: opts.raw ? "application/vnd.github.raw+json" : "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (res.status === 401) throw new Error("GitHub says this key is not valid. Copy it again (it starts with github_pat_ and has no spaces), or regenerate it.");
  if (res.status === 403 || res.status === 404) throw new Error(
    "The key works, but it can't open " + repo + ". Edit the token: Repository access must include cpt_agent, " +
    "and Permissions must have Contents: Read-only and Actions: Read and write.");
  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  if (res.status === 204) return null;
  return opts.raw ? res.text() : res.json();
}

async function loadAll() {
  const [s, c] = await Promise.all([
    gh(`/contents/state.json?ref=main&t=${Date.now()}`, { raw: true }),
    config ? Promise.resolve(null) : gh(`/contents/config.json?ref=main`, { raw: true }),
  ]);
  state = JSON.parse(s || "{}");
  if (c) config = JSON.parse(c);
}

async function dispatch(inputs) {
  await gh(`/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    body: JSON.stringify({ ref: "main", inputs }),
  });
}

// ---------------------------------------------------------------- helpers
function weekKey(d = new Date()) {
  // Monday of this week in New York time
  const ny = new Date(d.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = (ny.getDay() + 6) % 7;
  ny.setDate(ny.getDate() - day);
  return `${ny.getFullYear()}-${String(ny.getMonth() + 1).padStart(2, "0")}-${String(ny.getDate()).padStart(2, "0")}`;
}
function fmt(iso, withDay = true) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-US", { timeZone: "America/New_York",
    ...(withDay ? { weekday: "short" } : {}), month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function weekLabel(key) {
  const m = new Date(key + "T12:00:00"), s = new Date(m); s.setDate(m.getDate() + 6);
  const o = { month: "short", day: "numeric" };
  return `${m.toLocaleDateString("en-US", o)} – ${s.toLocaleDateString("en-US", o)}`;
}
const STATUS = {
  none: ["No work log due this week", ""],
  verify: ["Checking Canvas…", "busy"],
  pending: ["Waiting for your confirmation", "warn"],
  confirmed: ["Submitting…", "busy"],
  retry: ["Retrying the upload…", "busy"],
  submitted: ["Submitted ✓", "good"],
  already_submitted: ["Already submitted ✓", "good"],
  failed: ["Couldn't submit - upload it yourself", "bad"],
  missed: ["Deadline passed", "bad"],
  manual: ["Submit this one yourself", "bad"],
};
const isBusy = (r) => r && ["verify", "confirmed", "retry"].includes(r.status);

function currentWeek() {
  const key = weekKey();
  if (state.weeks && state.weeks[key]) return [key, state.weeks[key]];
  // fall back to any week still needing attention
  const open = Object.entries(state.weeks || {}).find(([, w]) => ["pending", "verify", "confirmed", "retry"].includes(w.status));
  return open || [key, null];
}

// ---------------------------------------------------------------- render
function render() {
  const [key, rec] = currentWeek();
  $("weekTitle").textContent = rec && rec.name ? rec.name : `Week of ${weekLabel(key)}`;
  $("weekSub").textContent = rec && rec.due_at ? `Due ${fmt(rec.due_at)} · ${weekLabel(key)}` : weekLabel(key);
  const [label, tone] = rec ? (STATUS[rec.status] || [rec.status, ""]) : ["Not checked yet - runs Friday 9 AM", ""];
  const pill = $("weekPill");
  pill.className = "pill" + (tone && tone !== "busy" ? " " + tone : "");
  pill.innerHTML = (tone === "busy" ? '<span class="spin"></span>' : "") + escapeHtml(label);
  if (rec && rec.submitted_at && rec.status === "submitted") pill.innerHTML += ` · ${escapeHtml(fmt(rec.submitted_at))}`;

  const canConfirm = rec && ["pending", "failed", "retry"].includes(rec.status);
  $("hoursBox").classList.toggle("hidden", !canConfirm);
  if (canConfirm && !$("hours").dataset.week) buildHours(key, rec.hours || (config && config.default_hours) || [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0]);
  if (!canConfirm) delete $("hours").dataset.week;

  // messages
  const inbox = (state.inbox || []).slice().reverse();
  $("feed").innerHTML = inbox.length
    ? inbox.slice(0, 15).map((m) => `<li><time>${escapeHtml(fmt(m.t))}</time>${escapeHtml(m.text)}</li>`).join("")
    : '<li class="sub">No messages yet.</li>';
  const shot = state.last_screen;
  $("shotBox").classList.toggle("hidden", !shot);
  if (shot) { $("shotImg").src = "data:image/jpeg;base64," + shot.jpeg; $("shotLabel").textContent = `Last login screenshot · ${fmt(shot.t)}`; }

  // history
  const weeks = Object.entries(state.weeks || {}).filter(([, w]) => w.name).sort((a, b) => b[0].localeCompare(a[0]));
  $("history").innerHTML = weeks.length ? weeks.map(([k, w]) => {
    const [l] = STATUS[w.status] || [w.status];
    return `<div class="row"><span>${escapeHtml(w.name.replace(": Work Hour Log", ""))}<br><span class="sub">${weekLabel(k)}</span></span>
            <span style="text-align:right">${escapeHtml(l)}${w.submitted_at ? `<br><span class="sub">${escapeHtml(fmt(w.submitted_at))}</span>` : ""}</span></div>`;
  }).join("") + '<div class="row"><button id="filesBtn">Show submitted files</button></div>' : '<div class="sub">Nothing yet.</div>';
  const fb = $("filesBtn"); if (fb) fb.onclick = showFiles;

  // busy banner
  const busy = isBusy(rec);
  $("busyBanner").classList.toggle("hidden", !busy);
  if (busy) $("busyBanner").innerHTML = '<span class="spin"></span> Working on Canvas - approve the <b>Duo</b> push if it appears.';
  if (busy) startPolling();

  renderUpcoming();
  renderDiscussions();
  renderNotif();
  updateDots();
  if (store.get("cpt_tab") === "more") store.set("cpt_seen_msgs", String((state.inbox || []).length));
}

function renderUpcoming() {
  const up = state.upcoming;
  if (!up || !up.items) { $("upcoming").innerHTML = '<div class="sub">Tap "Refresh due dates" to load your courses.</div>'; return; }
  const status = (state.upcoming_status && state.upcoming_status.items) || {};
  const courses = [...new Set(up.items.map((i) => i.course))].sort();
  const now = Date.now();
  let html = "", lastDay = "";
  for (const it of up.items) {
    const due = new Date(it.due);
    const day = due.toLocaleDateString("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" });
    if (day !== lastDay) { html += `<div class="day">${escapeHtml(day)}</div>`; lastDay = day; }
    const s = status[String(it.id)];
    // Canvas marks graded discussions differently from upload assignments.
    // Require this week's verified discussion history before changing their
    // due-date status. 1/2 replies means INCOMPLETE, not "Submitted".
    const currentHistory = state.discussion_history;
    const weekOfDue = weekKey(due);
    const discussion = currentHistory && weekOfDue === currentHistory.week_start
      ? discussionDueStatus(state, it, weekOfDue,
          Number(config && config.default_discussion_replies) || 2)
      : null;
    let st = '<span class="st unk">—</span>';
    if (discussion) {
      st = '<span class="st ' + discussion.tone + '">' +
        escapeHtml(discussion.text) + '</span>';
    } else if (s && s.submitted) st = '<span class="st good">Submitted ✓</span>';
    else if (s && s.missing) st = '<span class="st bad">Missing</span>';
    else if (s) st = due.getTime() < now ? '<span class="st bad">Not submitted</span>' : '<span class="st">Not submitted</span>';
    const ci = courses.indexOf(it.course) % 3;
    const time = due.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
    html += `<div class="item"><a href="${escapeHtml(it.url)}" target="_blank" rel="noopener">
      <span class="course${ci ? " c" + ci : ""}">${escapeHtml(it.course)}</span>${escapeHtml(it.name)}
      <div class="sub">${it.allday ? "Due end of day" : "Due " + escapeHtml(time)}</div></a>${st}</div>`;
  }
  $("upcoming").innerHTML = html || '<div class="sub">Nothing due in the next 3 weeks.</div>';
  const chk = state.upcoming_status && state.upcoming_status.checked;
  $("upcomingNote").textContent = `Due dates updated ${fmt(up.updated)}.` +
    (chk ? ` Assignment submission statuses checked ${fmt(chk)}.` :
      " Assignment statuses appear after the next Canvas check.") +
    (state.discussion_history && state.discussion_history.week_start === weekKey()
      ? ` Discussion posts and replies verified ${fmt(state.discussion_history.checked_at)}.`
      : " Discussion progress appears after fetching this week's Canvas discussions.");
}

function buildHours(key, hours) {
  const box = $("hours");
  box.dataset.week = key;
  box.innerHTML = DAYS.map((d, i) =>
    `<label>${d}<input inputmode="decimal" id="h${i}" value="${hours[i] ?? 0}"></label>`).join("");
  box.querySelectorAll("input").forEach((el) => el.addEventListener("input", updateTotal));
  updateTotal();
}
function readHours() {
  const v = DAYS.map((_, i) => parseFloat(($(`h${i}`).value || "0").replace(",", ".")));
  return v.every((x) => !isNaN(x) && x >= 0 && x <= 24) ? v : null;
}
function updateTotal() {
  const h = readHours();
  $("total").textContent = h ? `Total: ${+h.reduce((a, b) => a + b, 0).toFixed(2)} hours` : "Each day must be 0–24";
  $("confirmBtn").disabled = !h;
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

// ---------------------------------------------------------------- actions
async function act(inputs, msg) {
  try {
    setButtons(true);
    await dispatch(inputs);
    $("busyBanner").classList.remove("hidden");
    $("busyBanner").innerHTML = `<span class="spin"></span> ${msg}`;
    startPolling(true);
  } catch (e) { alert(e.message); }
  finally { setButtons(false); }
}
function setButtons(dis) { ["confirmBtn", "doneBtn", "checkBtn"].forEach((id) => { $(id).disabled = dis; }); }

$("confirmBtn").onclick = () => {
  const [key, rec] = currentWeek(); const h = readHours(); if (!h || !rec) return;
  const total = +h.reduce((a, b) => a + b, 0).toFixed(2);
  if (!confirm(`Submit ${rec.name} with ${total} hours?`)) return;
  act({ action: "confirm", week: key, hours: h.join(",") }, "Submitting - approve the <b>Duo</b> push in about 1–2 minutes.");
};
$("doneBtn").onclick = () => { const [key] = currentWeek(); act({ action: "done", week: key }, "Marking as already submitted…"); };
$("checkBtn").onclick = () => act({ action: "check" }, "Checking Canvas - approve the <b>Duo</b> push in about 1–2 minutes.");
$("refreshBtn").onclick = () => refresh(true);
$("upcomingBtn").onclick = () => act({ action: "init" }, "Refreshing due dates (no Duo needed)…");

function startPolling(fresh = false) {
  pollUntil = Math.max(pollUntil, Date.now() + (fresh ? 8 : 3) * 60 * 1000);
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (Date.now() > pollUntil) { clearInterval(pollTimer); pollTimer = null; return; }
    await refresh();
  }, 10000);
}

async function refresh(manual = false) {
  try {
    if (manual) $("refreshBtn").innerHTML = '<span class="spin"></span>';
    await loadAll();
    render();
    loadRunInfo();
  } catch (e) {
    $("busyBanner").classList.remove("hidden");
    $("busyBanner").textContent = e.message;
  } finally { $("refreshBtn").textContent = "↻"; }
}

async function loadRunInfo() {
  const recent = $("agentRunsList");
  try {
    // The GitHub Actions API is authoritative for actual run timestamps/status,
    // including runs from before the history feature was installed.
    const result = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=10`);
    const runs = (result.workflow_runs || []).slice(0, 10);
    if (!runs.length) {
      $("runInfo").textContent = "No agent runs found.";
      if (recent) recent.textContent = "No runs yet.";
      return;
    }
    const auditRecords = new Map(((state && state.agent_runs) || []).map(r => [String(r.run_id), r]));
    const statusText = (run) => run.status === "completed"
      ? (run.conclusion || "completed")
      : (run.status || "unknown").replaceAll("_", " ");
    const first = runs[0];
    const firstTime = first.run_started_at || first.created_at;
    $("runInfo").innerHTML = `Last run: <b>${escapeHtml(statusText(first))}</b> · ${escapeHtml(fmt(firstTime))}<br>` +
      `<a href="${escapeHtml(first.html_url || "#")}" target="_blank" rel="noopener noreferrer">Open in GitHub</a>`;
    if (recent) {
      recent.innerHTML = runs.map(run => {
        const audit = auditRecords.get(String(run.id));
        const label = audit ? audit.label
          : run.event === "schedule" ? "Scheduled check"
          : run.event === "workflow_dispatch" ? "Manual run" : "Agent run";
        const time = (audit && audit.finished_at) || run.run_started_at || run.created_at;
        const status = statusText(run);
        const tone = status === "success" ? "good" :
          ["failure", "cancelled", "timed_out"].includes(status) ? "bad" : "unk";
        const url = (run.html_url || "").startsWith("https://github.com/")
          ? run.html_url : "";
        return `<div class="disc">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <span style="font-weight:600;font-size:14px">${escapeHtml(label)}</span>
            <span class="st ${tone}">${escapeHtml(status)}</span>
          </div>
          <div class="sub" style="font-size:12px;margin-top:4px">${escapeHtml(fmt(time))}</div>
          ${url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" style="font-size:13px">View run</a>` : ""}
        </div>`;
      }).join("");
    }
  } catch (e) {
    if (recent) recent.textContent = "Could not load recent GitHub runs. Try refreshing.";
  }
}

async function showFiles() {
  try {
    const files = await gh(`/contents/submitted?ref=main`);
    const list = (files || []).filter((f) => f.type === "file").sort((a, b) => b.name.localeCompare(a.name));
    if (!list.length) return alert("No submitted files saved yet.");
    $("history").insertAdjacentHTML("beforeend", list.map((f) =>
      `<div class="row"><button data-path="${escapeHtml(f.path)}">${escapeHtml(f.name)}</button></div>`).join(""));
    $("history").querySelectorAll("button[data-path]").forEach((b) => b.onclick = async () => {
      const meta = await gh(`/contents/${b.dataset.path}?ref=main`);
      window.open(meta.download_url, "_blank");  // short-lived link, opens the PDF in Safari
    });
    $("filesBtn").remove();
  } catch (e) { alert(e.message); }
}

// ---------------------------------------------------------------- notifications
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function renderNotif() {
  const banner = $("installBanner");
  if (!standalone()) {
    banner.classList.remove("hidden");
    $("notifState").textContent = "Add this app to your Home Screen first (Share → Add to Home Screen).";
    $("notifBtn").classList.add("hidden"); $("testBtn").classList.add("hidden");
    return;
  }
  banner.classList.add("hidden");
  if (!pushSupported()) { $("notifState").textContent = "Notifications need iOS 16.4 or later."; $("notifBtn").classList.add("hidden"); return; }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  const on = Notification.permission === "granted" && sub;
  $("notifState").textContent = on ? "On - reminders only when Canvas verifies unfinished work due tomorrow." :
    Notification.permission === "denied" ? "Blocked - turn on in iPhone Settings → Notifications → CPT Hours." : "Off";
  $("notifBtn").classList.toggle("hidden", !!on);
  // No test push: only verified, unsubmitted work due tomorrow can trigger a phone alert.
  $("testBtn").classList.add("hidden");
}

function b64ToU8(b64) {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

$("notifBtn").onclick = async () => {
  try {
    if (!state.vapid || !state.vapid.public) {
      await dispatch({ action: "init" });
      return alert("Setting up notification keys - wait about 1 minute, tap ↻, then try again.");
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return renderNotif();
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ||
      await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(state.vapid.public) });
    await dispatch({ action: "subscribe", payload: JSON.stringify(sub.toJSON()) });
    alert("Notifications enabled. You will only be alerted for verified unfinished assignments due tomorrow.");
    renderNotif();
  } catch (e) { alert("Couldn't turn on notifications: " + e.message); }
};
$("testBtn").onclick = () => alert("Test pushes are disabled. Reminders only arrive for verified, unsubmitted work due tomorrow.");



// ---------------------------------------------------------------- discussions
const openDiscs = () => ((state && state.discussions) || []).filter((d) =>
  !d.hidden && d.due && weekKey(new Date(d.due)) === weekKey() &&
  !verifiedDiscussionStatus(state, d, weekKey()).complete);
const discSig = () => openDiscs().map((d) => `${d.id}:${(d.post_draft || "").length}:${(d.reply_drafts || []).length}`).join("|");
const words = (t) => (t.trim().match(/\S+/g) || []).length;

function renderDiscussions() {
  const list = openDiscs();
  const scanned = state.discussions_scanned;
  $("discNote").textContent = scanned ? `Last checked ${fmt(scanned)} · scheduled weekday checks and on-demand scan. Research sources must be reviewed before posting.` :
    "Not checked yet - tap Find discussions now (approve Duo).";
  if (!list.length) { $("discList").innerHTML = `<div class="sub">${scanned ? "No discussions need replies or initial posts this week. Completed responses remain under submitted discussions." : "—"}</div>`; return; }
  // keep any edits the user is making
  const typing = document.activeElement && document.activeElement.classList.contains("draft");
  if (typing) return;
  const courses = [...new Set(((state.upcoming && state.upcoming.items) || []).map((i) => i.course).concat(list.map((d) => d.course)))].sort();
  $("discList").innerHTML = list.map((d) => {
    const ci = courses.indexOf(d.course) % 3;
    const checked = verifiedDiscussionStatus(state, d, weekKey());
    const repliesLeft = Math.max(0, checked.required - checked.count);
    const status = [d.posted || d.post_done ? "Initial post ✓" : (d.canvas_entries_verified ? "Initial post needed" : "Initial post unverified"),
      d.replies_needed ? `Replies ${checked.count}/${d.replies_needed}` : ""].filter(Boolean).join(" · ");
    let h = `<div class="disc"><span class="course${ci ? " c" + ci : ""}">${escapeHtml(d.course)}</span>
      <h3>${escapeHtml(d.title)}</h3><div class="sub">Due ${escapeHtml(d.due_text || "")} · ${escapeHtml(status)}</div>
      <details><summary>Instructor prompt</summary><div class="prompt">${escapeHtml(d.prompt)}</div></details>`;
    if (d.rubric) h += `<details><summary>Grading rubric / assignment instructions</summary><div class="prompt">${escapeHtml(d.rubric)}</div></details>`;
    const reading = d.course_materials || [];
    const sources = d.research_sources || [];
    h += `<details><summary>Research & course evidence (${reading.length} course items, ${sources.length} web sources)</summary>
      <div class="smallnote">Check cited works, APA details, and AI-use requirements before submitting. Materials and excerpts may be incomplete.</div>
      <div class="smallnote">Research links support review, but bibliographic claims and quotations have not been independently guaranteed.</div>
      ${d.research_error ? '<div class="smallnote">Research unavailable: ' + escapeHtml(d.research_error) + '</div>' : ""}
      ${(d.course_material_warnings || []).length
        ? '<div class="smallnote">' + escapeHtml(d.course_material_warnings.join("; ")) + '</div>' : ""}
      <h4>Relevant Canvas module items</h4>
      ${reading.length ? reading.map(m => {
        const url = (m.url || "").startsWith("https://belhaven.instructure.com/")
          ? '<a target="_blank" rel="noopener noreferrer" href="' + escapeHtml(m.url) + '">' + escapeHtml(m.title) + '</a>'
          : escapeHtml(m.title);
        return '<div class="smallnote">' + url + ' · ' + escapeHtml(m.module || "") +
          '<div class="prompt" style="white-space:pre-wrap">' + escapeHtml((m.excerpt || "").slice(0,1800)) + '</div></div>';
      }).join("") : '<div class="smallnote">No accessible matching module content found.</div>'}
      <h4>Web research and verification</h4>
      <div class="prompt" style="white-space:pre-wrap">${escapeHtml(d.research_notes || "Not available yet.")}</div>
      ${sources.map(ref => {
        const link = /^https:\/\//.test(ref.url || "")
          ? '<a href="' + escapeHtml(ref.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(ref.title || ref.url) + '</a>'
          : escapeHtml(ref.title || "Source");
        return '<div class="smallnote">' + link + '</div>';
      }).join("")}
    </details>`;

    if (!d.posted && !d.post_done) {
      h += d.post_draft ? draftBlock(d, null, "Your post draft", d.post_draft, false) :
        '<div class="smallnote">Draft not ready - tap Find discussions now.</div>';
    }
    const candidates = checked.pending;
    for (const r of candidates) {
      const refs = r.supporting_sources || [];
      const evidence = refs.length ? `<details><summary>Evidence selected for ${escapeHtml(r.to)} (${refs.length})</summary>
        <div class="smallnote">This source was selected for the classmate's actual argument. Verify that your reply accurately applies its findings.</div>
        ${refs.map(src => {
          const url = (src.url || "").startsWith("https://doi.org/")
            ? '<a href="' + escapeHtml(src.url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(src.author || "Verified study") + '</a>'
            : escapeHtml(src.author || "Research source");
          return '<div class="smallnote">' + url + '</div><div class="prompt">' +
            escapeHtml(src.apa || "") + '</div><div class="smallnote">' +
            escapeHtml(src.finding || "") + '</div>';
        }).join("")}
        </details>` : '<div class="smallnote">No independently verified peer-specific source attached yet. Use Redraft to search available verified source options.</div>';
      const recentAt = r.updated_at || r.created_at;
      const postedAt = recentAt ? " · " + escapeHtml(fmt(recentAt)) : "";
      h += `<details><summary>${escapeHtml(r.to)}'s recent post${postedAt}</summary><div class="prompt">${escapeHtml(r.their_post)}</div></details>`
        + evidence
        + draftBlock(d, r, `Reply to ${r.to.split(" ")[0]}`, r.draft, true);
    }
    if (d.posted && repliesLeft > 0 && candidates.length) {
      h += `<div class="smallnote">Showing the newest eligible classmate posts from this week (last ${Number(d.recent_post_window_days || 4)} days), newest first. Review each classmate's actual message before approving.</div>`;
      h += `<div class="btnrow"><button class="btn" data-act="submit_replies" data-id="${d.id}">
        Approve &amp; Submit Selected Replies</button></div>
        <div class="smallnote">Select up to two classmates. Review or edit each reply above before approving.</div>`;
    }
    if (repliesLeft && !candidates.length) {
      const reason = d.can_see_classmates
        ? d.recent_posts_available === 0
          ? "Classmates have posted, but there are no recent, unanswered posts from the past " + (d.recent_post_window_days || 4) + " days. The agent will check again rather than drafting a reply to an old post."
          : (d.research_error ? "Recent classmates' posts are visible, but research or drafting needs another check. Tap Find discussions now."
             : "Recent classmates' posts are available. No drafts are ready yet; tap Find discussions now.")
        : "Classmates' posts aren't accessible yet. Check Canvas after your initial post.";
      h += `<div class="smallnote">${escapeHtml(reason)}</div>`;
    }
    h += `<div class="btnrow"><a class="btn ghost" style="text-align:center;text-decoration:none" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Open in Canvas</a>
      <button class="btn ghost" data-act="hide" data-id="${d.id}">Hide</button></div></div>`;
    return h;
  }).join("");
  $("discList").querySelectorAll("textarea.draft").forEach((ta) => ta.addEventListener("input", () => {
    ta.closest(".draftbox").querySelector(".wc").textContent = `${words(ta.value)} words`;
  }));
  $("discList").querySelectorAll("button[data-act]").forEach((b) => b.onclick = () => discAction(b));
}

function draftBlock(d, r, label, text, isReply) {
  const eid = r ? r.entry_id : "";
  const displayText = isReply ? cleanPeerReply(text || "") : (text || "");
  return `<div class="draftbox"><div class="draft-label"><span>${escapeHtml(label)}</span><span class="wc">${words(displayText)} words</span></div>
    <textarea class="draft${isReply ? " reply" : ""}" id="ta-${d.id}-${eid}">${escapeHtml(displayText)}</textarea>
    ${isReply ? `<label class="smallnote" style="display:block;margin:8px 0">
      <input type="checkbox" class="peer-select" data-topic="${d.id}" data-entry="${eid}"> Select this reply for submission
    </label>` : ""}
    <div class="btnrow"><button class="btn" data-act="copy" data-id="${d.id}" data-entry="${eid}">Copy</button>
      <button class="btn secondary" data-act="edit" data-id="${d.id}" data-entry="${eid}">Edit</button>
      <button class="btn secondary" data-act="redraft" data-id="${d.id}" data-entry="${eid}">Regenerate</button>
      ${!isReply ? `<button class="btn" data-act="submit_initial" data-id="${d.id}" style="grid-column:1 / -1">Approve &amp; Submit Initial Post</button>` : ""}
      ${isReply
        ? `<button class="btn ghost" data-act="delete_reply_draft" data-id="${d.id}" data-entry="${eid}" style="grid-column:1 / -1">Delete Draft (not Canvas)</button>`
        : `<button class="btn ghost" data-act="posted" data-id="${d.id}" data-entry="" style="grid-column:1 / -1">I posted manually - verify in Canvas</button>`}
      </div></div>`;
}

async function sha256Text(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

async function discAction(b) {
  const id = b.dataset.id, entry = b.dataset.entry || "";
  const act = b.dataset.act;
  if (act === "submit_replies" || act === "submit_initial") {
    const d = openDiscs().find(x => String(x.id) === String(id));
    if (!d) return alert("Discussion was not found for the current week. Refresh first.");
    const verified = verifiedDiscussionStatus(state, d, weekKey());
    if (verified.complete) return alert("Canvas already shows the required replies. Nothing to submit.");
    const chosen = act === "submit_initial" ? [null] :
      [...$("discList").querySelectorAll('input.peer-select:checked')].filter(el => el.dataset.topic === id)
        .map(el => verified.pending.find(r => String(r.entry_id) === el.dataset.entry))
        .filter(Boolean);
    const maxAllowed = act === "submit_initial" ? 1 :
      Math.min(2, Math.max(0, verified.required - verified.count));
    if (!chosen.length || chosen.length > maxAllowed) {
      return alert(maxAllowed ? "Select up to " + maxAllowed +
        " unanswered classmate" + (maxAllowed === 1 ? "" : "s") + " to finish this discussion."
        : "Canvas already shows all required replies. Nothing more to submit.");
    }
    const people = chosen.filter(Boolean).map(r => r.to);
    if (people.length !== new Set(people).size) return alert("Choose different classmates.");
    const items = chosen.map(r => ({
      entry_id: r ? r.entry_id : "",
      body: $ (`ta-${id}-${r ? r.entry_id : ""}`).value,
      original: r ? r.draft : d.post_draft
    }));
    if (items.some(item => !item.body || item.body.trim().length < 30)) {
      return alert("Each approved response needs at least 30 characters.");
    }
    const msg = act === "submit_initial" ?
      "Submit the exact initial post currently shown above to Canvas?" :
      "Submit " + items.length + " exact reviewed replies to " + people.join(" and ") + " in Canvas?";
    if (!confirm(msg + "\n\nCanvas will post these on your behalf. Review your text and citations first.")) return;
    for (const item of items) {
      item.draft_hash = await sha256Text(item.original || "");
      delete item.original;
    }
    return act2({
      action: "disc_submit",
      payload: JSON.stringify({
        course_id: d.course_id, topic_id: d.id,
        kind: act === "submit_initial" ? "initial" : "replies", items
      })
    }, "Submitting only the responses you approved - approve Duo if asked.");
  }
  if (act === "edit") {
    const ta = $("ta-" + id + "-" + entry);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
    return;
  }
  if (act === "delete_reply_draft") {
    if (!entry || !confirm("Delete this UNSENT draft from the app? This will not delete a Canvas reply.")) return;
    try {
      b.disabled = true;
      await dispatch({
        action: "disc_mark",
        payload: JSON.stringify({ id, kind: "delete_reply_draft", entry_id: entry })
      });
      const d = openDiscs().find(x => String(x.id) === String(id));
      if (d) d.reply_drafts = (d.reply_drafts || []).filter(r => String(r.entry_id) !== entry);
      renderDiscussions();
      startPolling(true);
    } catch (e) {
      alert("Couldn't delete the draft: " + e.message);
      b.disabled = false;
    }
    return;
  }
  if (act === "copy") {
    const ta = $(`ta-${id}-${entry}`);
    try { await navigator.clipboard.writeText(ta.value); }
    catch { ta.focus(); ta.select(); document.execCommand("copy"); }
    b.textContent = "Copied ✓"; setTimeout(() => { b.textContent = "Copy"; }, 1800);
    return;
  }
  if (act === "redraft") {
    const note = window.prompt("Anything to change? (e.g. shorter, more personal, add a work example). Leave empty for a fresh version.", "");
    if (note === null) return;
    return act2({ action: "redraft", payload: JSON.stringify({ id, kind: entry ? "reply" : "post", entry_id: entry || undefined, note }) },
      "Writing a new draft - about 1 minute…");
  }
  if (act === "posted") {
    return act2({action: "discussions"}, "Verifying your submitted initial post in Canvas - approve Duo if requested.");
  }
  if (act === "hide" && !confirm("Hide this discussion from the list?")) return;
  const payload = act === "hide" ? { id } : act === "posted" ? { id, kind: "post" } : { id, entry_id: entry };
  // update screen immediately, sync in background
  const d = openDiscs().find((x) => String(x.id) === String(id));
  if (d) {
    if (act === "hide") d.hidden = true;
    else if (act === "posted") d.post_done = true;
    else (d.reply_drafts || []).forEach((r) => { if (String(r.entry_id) === entry) r.done = true; });
    renderDiscussions();
  }
  dispatch({ action: "disc_mark", payload: JSON.stringify(payload) }).catch((e) => alert(e.message));
}
async function act2(inputs, msg) { return act(inputs, msg); }
$("discScanBtn").onclick = () => act({ action: "discussions" }, "Checking all courses for discussions - approve the <b>Duo</b> push in about 1–2 minutes.");

// ---------------------------------------------------------------- document preview (same layout as the submitted PDF)
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function docWeekLabel(key) {
  const [y, m, d] = key.split("-").map(Number);
  const mon = new Date(Date.UTC(y, m - 1, d)), sun = new Date(Date.UTC(y, m - 1, d + 6));
  const M = (x) => MONTHS[x.getUTCMonth()];
  if (mon.getUTCMonth() === sun.getUTCMonth()) return `Week of ${M(mon)} ${mon.getUTCDate()}-${sun.getUTCDate()}, ${sun.getUTCFullYear()}`;
  if (mon.getUTCFullYear() === sun.getUTCFullYear()) return `Week of ${M(mon)} ${mon.getUTCDate()} - ${M(sun)} ${sun.getUTCDate()}, ${sun.getUTCFullYear()}`;
  return `Week of ${M(mon)} ${mon.getUTCDate()}, ${mon.getUTCFullYear()} - ${M(sun)} ${sun.getUTCDate()}, ${sun.getUTCFullYear()}`;
}
const fmtH = (h) => `${+(+h).toFixed(2)} hours`;
function todayMDY() {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit", year: "numeric" }).formatToParts(new Date());
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g("month")}-${g("day")}-${g("year")}`;
}
function docHtml(key, hours, name) {
  const full = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
  const total = hours.reduce((a, b) => a + b, 0);
  const e = escapeHtml;
  const rows = [["Day", "Hours Worked"], ...full.map((d, i) => [d, fmtH(hours[i])]), ["Total Hours", fmtH(total)]]
    .map(([a, b]) => `<tr><td>${e(a)}</td><td>${e(b)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:#fff;color:#000}
    body{font-family:"Times New Roman",Times,"Liberation Serif",serif;font-size:12pt;padding:0.65in 0.85in 0.7in}
    p{margin:0;line-height:1.15;white-space:pre-wrap}.c{text-align:center}
    .t{font-size:16pt;font-weight:bold;margin-bottom:10pt}
    table{width:100%;border-collapse:collapse;margin-bottom:18pt}
    td{border:0.75pt solid #000;text-align:center;font-size:11.5pt;padding:2.5pt 4pt}
  </style></head><body>
    <p class="c t">BUS-799 Applied Learning Practicum</p>
    <p class="c t">Weekly Work Hour Log</p>
    <p class="c" style="margin-bottom:8pt">Student: ${e(name)}</p>
    <p class="c" style="margin-bottom:24pt">${e(docWeekLabel(key))}</p>
    <table>${rows}</table>
    <p style="margin-bottom:14pt"><b>Weekly Total:</b> ${e(fmtH(total))}</p>
    <p style="margin-bottom:24pt"><b>Student Confirmation:</b> I confirm that the work hours reported above for this week are ${e(fmtH(total))}.</p>
    <p style="margin-bottom:10pt">Signature:  ${e(name)}</p>
    <p>Date:  ${todayMDY()}</p>
  </body></html>`;
}
function fitPaper() {
  const wrap = $("paperWrap"), paper = $("paper");
  const scale = Math.min(1, wrap.clientWidth / 816);
  paper.style.transform = `scale(${scale})`;
  paper.style.marginBottom = `${-1056 * (1 - scale)}px`;
  paper.style.marginRight = `${-816 * (1 - scale)}px`;
}
$("previewBtn").onclick = () => {
  const [key, rec] = currentWeek();
  const editing = !$("hoursBox").classList.contains("hidden") && readHours();
  const hours = editing || (rec && rec.hours) || (config && config.default_hours) || [7.5, 7.5, 7.5, 7.5, 7.5, 0, 0];
  const name = (config && config.student_name) || "";
  $("paper").srcdoc = docHtml(key, hours, name);
  $("previewName").textContent = `${(rec && rec.name) || docWeekLabel(key)} · ${fmtH(hours.reduce((a, b) => a + b, 0))}`;
  $("previewSheet").classList.remove("hidden");
  requestAnimationFrame(fitPaper);
};
$("previewClose").onclick = () => $("previewSheet").classList.add("hidden");
window.addEventListener("resize", () => { if (!$("previewSheet").classList.contains("hidden")) fitPaper(); });

// ---------------------------------------------------------------- setup + start
$("saveSetup").onclick = async () => {
  token = $("tokenInput").value.replace(/\s+/g, "");
  repo = $("repoInput").value.trim().replace(/^https:\/\/github.com\//, "").replace(/\/$/, "");
  if (!token) return alert("Paste the access key first.");
  try {
    await loadAll();
    store.set("cpt_token", token); store.set("cpt_repo", repo);
    start();
  } catch (e) { alert(e.message); }
};
$("resetBtn").onclick = () => { if (confirm("Remove the saved access key from this phone?")) { store.del("cpt_token"); location.reload(); } };

function showPage(name) {
  document.querySelectorAll("[data-page]").forEach((el) => el.classList.toggle("off", el.dataset.page !== name));
  document.querySelectorAll(".tabbar button").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  $("subtitle").textContent = { week: "Weekly Work Hour Log", due: "Due dates – all courses", disc: "Discussion drafts", more: "Messages & settings" }[name];
  if (name === "disc") store.set("cpt_seen_disc", discSig());
  store.set("cpt_tab", name);
  if (name === "more") store.set("cpt_seen_msgs", String((state && state.inbox || []).length));
  window.scrollTo(0, 0);
  updateDots();
}
function updateDots() {
  if (!state) return;
  const seen = parseInt(store.get("cpt_seen_msgs") || "0", 10);
  const unread = (state.inbox || []).length > seen && store.get("cpt_tab") !== "more";
  $("moreDot").classList.toggle("hidden", !unread);
  const st = (state.upcoming_status && state.upcoming_status.items) || {};
  const soon = Date.now() + 2 * 864e5;
  const urgent = ((state.upcoming && state.upcoming.items) || []).some((i) => {
    const d = new Date(i.due).getTime(); const s = st[String(i.id)];
    return d > Date.now() && d < soon && !(s && s.submitted);
  });
  $("dueDot").classList.toggle("hidden", !urgent);
  $("discDot").classList.toggle("hidden", !(openDiscs().length && discSig() !== store.get("cpt_seen_disc") && store.get("cpt_tab") !== "disc"));
}
document.querySelectorAll(".tabbar button").forEach((b) => b.onclick = () => showPage(b.dataset.tab));

function start() {
  $("setup").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("tabbar").classList.remove("hidden");
  document.body.classList.add("tabs");
  showPage(store.get("cpt_tab") || "week");
  refresh();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => reg.update()).catch(() => {});
  // when a new version takes over, reload once so the new screens appear
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; location.reload(); } });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && token) refresh(); });
if (token) start(); else { $("setup").classList.remove("hidden"); $("repoInput").value = repo; }
