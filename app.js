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
    let st = '<span class="st unk">—</span>';
    if (s && s.submitted) st = '<span class="st good">Submitted ✓</span>';
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
    (chk ? ` Submitted status as of ${fmt(chk)} (updates when the agent logs in to Canvas).` : " Submitted status appears after the next Canvas check.");
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
  try {
    const r = await gh(`/actions/workflows/${WORKFLOW}/runs?per_page=1`);
    const run = r.workflow_runs && r.workflow_runs[0];
    if (!run) return;
    const st = run.status === "completed" ? run.conclusion : run.status.replace("_", " ");
    $("runInfo").innerHTML = `Last run: <b>${escapeHtml(st)}</b> · ${escapeHtml(fmt(run.created_at))}<br>` +
      `<a href="${run.html_url}" target="_blank" rel="noopener">Open in GitHub</a>`;
  } catch {}
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
  $("notifState").textContent = on ? "On - you'll get Friday reminders and Duo alerts." :
    Notification.permission === "denied" ? "Blocked - turn on in iPhone Settings → Notifications → CPT Hours." : "Off";
  $("notifBtn").classList.toggle("hidden", !!on);
  $("testBtn").classList.toggle("hidden", !on);
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
    alert("Done! You'll get a confirmation notification in about a minute.");
    renderNotif();
  } catch (e) { alert("Couldn't turn on notifications: " + e.message); }
};
$("testBtn").onclick = () => act({ action: "test" }, "Sending a test notification…");

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
  $("subtitle").textContent = { week: "Weekly Work Hour Log", due: "Due dates – all courses", more: "Messages & settings" }[name];
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
