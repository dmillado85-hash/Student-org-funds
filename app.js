/* ===========================================================
   QR CLASS ATTENDANCE – app.js (used by index.html + teacher.html)
   Database: Firebase Firestore
   =========================================================== */

/* ---------- 1. PASTE YOUR FIREBASE CONFIG HERE ---------- */
const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};
const DEFAULT_PIN = "1234";   // used only until the teacher changes it in Settings

/* ---------- 2. SHARED HELPERS ---------- */
const configured = !String(firebaseConfig.apiKey).startsWith("PASTE");
let db = null;
if (configured && window.firebase) {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
}
const TS = () => firebase.firestore.FieldValue.serverTimestamp();

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
};

// Order-independent, punctuation-free key: "Dela Cruz, Juan" == "juan dela cruz"
const nameKey = n => String(n || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean).sort().join(" ");

const fmtTime = ms => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const fmtDate = d => new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtClock = t => t ? new Date("2000-01-01T" + t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function genCode(len = 6) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, n => abc[n % abc.length]).join("");
}

function getDeviceId() {
  let id = store.get("qa_device");
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
    store.set("qa_device", id);
  }
  return id;
}

function toast(msg, type = "info", ms = 3200) {
  let box = $("#toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  box.appendChild(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 320); }, ms);
}

async function sha256(text) {
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return "plain:" + text; }   // very old / insecure-context fallback
}

/* ===========================================================
   3. STUDENT PAGE (index.html)
   =========================================================== */
const S = { profile: null, session: null, sid: "", busy: false, editing: false };

function showScreen(name) {
  $$(".screen").forEach(el => el.classList.toggle("hidden", el.id !== "screen-" + name));
}

function loadProfile() {
  let raw = store.get("qa_profile");
  if (!raw) {
    const m = document.cookie.match(/(?:^|;\s*)qa_profile=([^;]+)/);
    if (m) { try { raw = decodeURIComponent(m[1]); } catch (e) { raw = null; } }
  }
  try {
    const p = JSON.parse(raw);
    return p && p.name ? p : null;
  } catch (e) { return null; }
}
function saveProfile(p) {
  const json = JSON.stringify(p);
  store.set("qa_profile", json);
  document.cookie = "qa_profile=" + encodeURIComponent(json) + ";max-age=31536000;path=/;SameSite=Lax";
}
function clearProfile() {
  store.del("qa_profile");
  document.cookie = "qa_profile=;max-age=0;path=/";
}

function showError(msg) {
  $("#er-msg").textContent = msg;
  showScreen("error");
}
function showExpired(msg) {
  $("#ex-msg").textContent = msg;
  showScreen("expired");
}

function playCheck() {
  const svg = $("#ok-svg");
  svg.classList.remove("animate");
  void svg.getBoundingClientRect();
  svg.classList.add("animate");
}

function showSuccess(status, ms) {
  const p = S.profile, s = S.session;
  const late = status === "Late";
  const card = $("#screen-success");
  card.classList.toggle("is-late", late);
  card.classList.toggle("is-present", !late);
  $("#ok-icon").className = "icon-circle " + (late ? "late" : "present");
  $("#ok-greeting").textContent = `Hi ${p.name},`;
  $("#ok-status").textContent = late ? "You are marked LATE" : "You are marked PRESENT!";
  $("#ok-time").textContent = fmtTime(ms);
  $("#ok-section").textContent = p.section;
  $("#ok-session").textContent = s.title || s.className || "—";
  showScreen("success");
  playCheck();
  if (navigator.vibrate) navigator.vibrate(late ? [60, 40, 60] : 80);
}

function showAlready(existing) {
  const ms = existing.timeInLocal || (existing.timeIn && existing.timeIn.toMillis ? existing.timeIn.toMillis() : null);
  $("#al-greeting").textContent = `Hi ${S.profile.name},`;
  $("#al-detail").textContent = ms ? `You were already checked in at ${fmtTime(ms)}.` : "You were already checked in for this session.";
  showScreen("already");
}

function sessionProblem(s) {
  if (!s) return "This QR code is not valid.";
  if (s.status !== "active") return "This attendance session has ended.";
  if (s.expiresAt && Date.now() > s.expiresAt) return "This QR code has expired.";
  return null;
}

async function markPresent() {
  if (S.busy) return;
  S.busy = true;
  showScreen("loading");
  try {
    const sref = db.collection("sessions").doc(S.sid);
    const fresh = await sref.get();
    const problem = sessionProblem(fresh.exists ? fresh.data() : null);
    if (problem) { showExpired(problem); return; }
    S.session = { id: S.sid, ...fresh.data() };

    const col = sref.collection("attendance");
    const p = S.profile;
    const key = nameKey(p.name);
    const deviceId = getDeviceId();

    // same name already checked in (maybe from another device)?
    const byName = await col.where("nameKey", "==", key).limit(1).get();
    if (!byName.empty) { showAlready(byName.docs[0].data()); return; }

    const now = Date.now();
    const ref = col.doc(deviceId);
    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (snap.exists) return { dup: snap.data() };
      tx.set(ref, {
        name: p.name, nameKey: key, section: p.section, studentNo: p.studentNo || "",
        deviceId, timeIn: TS(), timeInLocal: now
      });
      return { ok: true };
    });
    if (result.dup) { showAlready(result.dup); return; }

    const late = S.session.lateAt && now > S.session.lateAt;
    showSuccess(late ? "Late" : "Present", now);
  } catch (e) {
    console.error(e);
    showError(e && e.code === "permission-denied"
      ? "The database refused the request. The teacher needs to check the Firestore rules."
      : "Could not reach the server. Check your internet connection and try again.");
  } finally {
    S.busy = false;
  }
}

function openRegister(editing) {
  S.editing = !!editing;
  const p = S.profile || {};
  $("#reg-name").value = p.name || "";
  $("#reg-section").value = p.section || "";
  $("#reg-no").value = p.studentNo || "";
  $("#reg-error").classList.add("hidden");
  $("#reg-title").textContent = editing ? "Edit your details" : "Welcome! Tell us who you are";
  $("#reg-sub").textContent = editing ? "Changes are saved on this phone." : "You only need to do this once. Your details are saved on this phone.";
  $("#reg-submit").textContent = S.sid && !editing ? "Save & Mark Present" : "Save";
  $("#reg-cancel").classList.toggle("hidden", !editing);
  showScreen("register");
}

function renderHome() {
  const p = S.profile;
  const chip = $("#home-profile");
  if (p) {
    chip.innerHTML = `Saved on this phone: <b>${esc(p.name)}</b> · ${esc(p.section)}${p.studentNo ? " · " + esc(p.studentNo) : ""}`;
    chip.classList.remove("hidden");
  } else {
    chip.classList.add("hidden");
  }
  $("#btn-edit-profile").textContent = p ? "Edit my details" : "Enter my details now";
  $("#btn-forget").classList.toggle("hidden", !p);
  showScreen("home");
}

async function initStudent() {
  S.sid = (new URLSearchParams(location.search).get("session") || "").trim().toUpperCase();
  S.profile = loadProfile();

  // events
  $("#reg-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("#reg-name").value.trim().replace(/\s+/g, " ");
    const section = $("#reg-section").value.trim();
    const studentNo = $("#reg-no").value.trim();
    const err = $("#reg-error");
    if (name.length < 2) { err.textContent = "Please enter your full name."; err.classList.remove("hidden"); return; }
    if (!section) { err.textContent = "Please enter your section."; err.classList.remove("hidden"); return; }
    S.profile = { name, section, studentNo };
    saveProfile(S.profile);
    if (S.sid && !S.editing) { markPresent(); }
    else { toast("Details saved", "success"); if (S.sid && S.session) { markPresent(); } else { renderHome(); } }
  });
  $("#reg-cancel").addEventListener("click", () => (S.sid ? location.reload() : renderHome()));
  $("#btn-edit-profile").addEventListener("click", () => openRegister(!!S.profile));
  $("#btn-forget").addEventListener("click", () => { clearProfile(); S.profile = null; toast("Saved details removed"); renderHome(); });
  $$(".btn-notyou").forEach(b => b.addEventListener("click", () => { clearProfile(); location.reload(); }));
  $("#er-retry").addEventListener("click", () => location.reload());

  if (!configured || !db) {
    showError("This app isn't connected to a database yet. The teacher needs to paste the Firebase config into app.js.");
    $("#er-retry").classList.add("hidden");
    return;
  }
  if (!S.sid) { renderHome(); return; }

  showScreen("loading");
  try {
    const snap = await db.collection("sessions").doc(S.sid).get();
    const data = snap.exists ? snap.data() : null;
    const problem = sessionProblem(data);
    if (problem) { showExpired(problem); return; }
    S.session = { id: S.sid, ...data };
    if (!S.profile) openRegister(false);
    else await markPresent();
  } catch (e) {
    console.error(e);
    showError("Could not reach the server. Check your internet connection and try again.");
  }
}

/* ===========================================================
   4. TEACHER DASHBOARD (teacher.html)
   =========================================================== */
const T = {
  classes: [], session: null, sessionId: null, entries: [], history: [],
  unsubSession: null, unsubEntries: null, unsubClasses: null,
  editClassId: null, qrFor: null, search: "", bound: false, defaultPin: false, fails: 0, lockUntil: 0
};

async function hashPin(pin) { return sha256("qa-pin:" + pin); }

async function verifyPin(pin) {
  const snap = await db.collection("settings").doc("admin").get();
  if (snap.exists) { T.defaultPin = false; return snap.data().pinHash === await hashPin(pin); }
  T.defaultPin = true;
  return pin === DEFAULT_PIN;
}

async function initTeacher() {
  if (!configured || !db) {
    $("#login-screen").classList.add("hidden");
    $("#config-warn").classList.remove("hidden");
    return;
  }
  $("#pin-form").addEventListener("submit", async e => {
    e.preventDefault();
    const err = $("#pin-error");
    const wait = T.lockUntil - Date.now();
    if (wait > 0) { err.textContent = `Too many tries. Wait ${Math.ceil(wait / 1000)}s.`; err.classList.remove("hidden"); return; }
    const pin = $("#pin-input").value.trim();
    if (!pin) return;
    $("#pin-submit").disabled = true;
    try {
      if (await verifyPin(pin)) {
        sessionStorage.setItem("qa_admin", "1");
        sessionStorage.setItem("qa_defpin", T.defaultPin ? "1" : "0");
        err.classList.add("hidden");
        enterAdmin();
      } else {
        T.fails++;
        if (T.fails >= 5) { T.lockUntil = Date.now() + 30000; T.fails = 0; }
        err.textContent = "Wrong PIN. Try again.";
        err.classList.remove("hidden");
        $("#pin-input").value = "";
      }
    } catch (ex) {
      console.error(ex);
      err.textContent = ex.code === "permission-denied" ? "Database refused access – check Firestore rules." : "Can't reach the database. Check your internet.";
      err.classList.remove("hidden");
    } finally { $("#pin-submit").disabled = false; }
  });

  if (sessionStorage.getItem("qa_admin") === "1") {
    T.defaultPin = sessionStorage.getItem("qa_defpin") === "1";
    enterAdmin();
  } else {
    $("#pin-input").focus();
  }
}

function enterAdmin() {
  $("#login-screen").classList.add("hidden");
  $("#admin").classList.remove("hidden");
  $("#pin-warning").classList.toggle("hidden", !T.defaultPin);
  if (!T.bound) { bindAdmin(); T.bound = true; }

  $("#s-date").value = todayStr();
  $("#s-late").value = store.get("qa_late") || "08:10";
  $("#h-date").value = "";
  $("#base-url").value = store.get("qa_base") || "";

  if (T.unsubClasses) T.unsubClasses();
  T.unsubClasses = db.collection("classes").orderBy("name").onSnapshot(snap => {
    T.classes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    populateClasses();
    if (T.session) renderTable();
  }, err => toast("Could not load classes: " + err.message, "error"));

  const last = store.get("qa_last_session");
  if (last) openSession(last, true);
  setInterval(() => { if (T.session) renderSessionStatus(); }, 20000);
}

function logout() {
  sessionStorage.removeItem("qa_admin");
  sessionStorage.removeItem("qa_defpin");
  location.reload();
}

/* ---------- classes ---------- */
function populateClasses() {
  const sel = $("#class-select"), hsel = $("#h-class");
  const prev = sel.value, hprev = hsel.value;
  sel.innerHTML = T.classes.length
    ? T.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("")
    : `<option value="">— create a class first —</option>`;
  hsel.innerHTML = `<option value="">All classes</option>` + T.classes.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
  if (prev && T.classes.some(c => c.id === prev)) sel.value = prev;
  else if (store.get("qa_class") && T.classes.some(c => c.id === store.get("qa_class"))) sel.value = store.get("qa_class");
  if (hprev) hsel.value = hprev;
  $("#btn-edit-class").disabled = !T.classes.length;
}

function openModal(id) { $("#" + id).classList.remove("hidden"); }
function closeModal(id) { $("#" + id).classList.add("hidden"); }

function openClassModal(id) {
  T.editClassId = id;
  const c = id ? T.classes.find(x => x.id === id) : null;
  $("#cm-title").textContent = c ? "Edit Class" : "New Class";
  $("#cm-name").value = c ? c.name : "";
  $("#cm-roster").value = c && c.roster ? c.roster.join("\n") : "";
  $("#cm-delete").classList.toggle("hidden", !c);
  openModal("modal-class");
  setTimeout(() => $("#cm-name").focus(), 50);
}

async function saveClass(e) {
  e.preventDefault();
  const name = $("#cm-name").value.trim();
  if (!name) return;
  const roster = $("#cm-roster").value.split("\n").map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean);
  try {
    if (T.editClassId) {
      await db.collection("classes").doc(T.editClassId).update({ name, roster });
    } else {
      const ref = await db.collection("classes").add({ name, roster, createdAt: TS() });
      store.set("qa_class", ref.id);
      setTimeout(() => { $("#class-select").value = ref.id; }, 400);
    }
    closeModal("modal-class");
    toast("Class saved", "success");
  } catch (ex) { toast("Could not save: " + ex.message, "error"); }
}

async function deleteClass() {
  if (!T.editClassId) return;
  if (!confirm("Delete this class? Existing sessions in History are kept.")) return;
  try {
    await db.collection("classes").doc(T.editClassId).delete();
    closeModal("modal-class");
    toast("Class deleted");
  } catch (ex) { toast(ex.message, "error"); }
}

/* ---------- sessions ---------- */
function studentBase() {
  const custom = (store.get("qa_base") || "").trim();
  return custom || new URL("index.html", location.href).href;
}
function studentLink(id) {
  const u = new URL(studentBase());
  u.searchParams.set("session", id);
  return u.href;
}

async function createSession() {
  const classId = $("#class-select").value;
  const cls = T.classes.find(c => c.id === classId);
  if (!cls) { toast("Create or select a class first", "error"); return; }
  const date = $("#s-date").value;
  if (!date) { toast("Pick a date", "error"); return; }
  const lateTime = $("#s-late").value;
  const valid = parseInt($("#s-valid").value || "0", 10) || 0;
  const title = $("#s-title").value.trim() || `${cls.name} - ${fmtDate(date)}`;
  const btn = $("#btn-create");
  btn.disabled = true;
  try {
    let id = "";
    for (let i = 0; i < 5; i++) {
      id = genCode();
      const x = await db.collection("sessions").doc(id).get();
      if (!x.exists) break;
    }
    await db.collection("sessions").doc(id).set({
      classId, className: cls.name, title, date, lateTime: lateTime || "",
      lateAt: lateTime ? new Date(`${date}T${lateTime}`).getTime() : null,
      status: "active", createdAt: TS(),
      expiresAt: valid > 0 ? Date.now() + valid * 60000 : null
    });
    store.set("qa_late", lateTime || "");
    store.set("qa_class", classId);
    $("#s-title").value = "";
    toast("Session created – QR is ready", "success");
    openSession(id);
  } catch (ex) { toast("Could not create session: " + ex.message, "error"); }
  finally { btn.disabled = false; }
}

function closeListeners() {
  if (T.unsubSession) { T.unsubSession(); T.unsubSession = null; }
  if (T.unsubEntries) { T.unsubEntries(); T.unsubEntries = null; }
}

function closeSessionPanel() {
  closeListeners();
  T.sessionId = null; T.session = null; T.entries = []; T.qrFor = null;
  store.del("qa_last_session");
  $("#session-panel").classList.add("hidden");
}

function openSession(id, silent) {
  closeListeners();
  T.sessionId = id; T.session = null; T.entries = []; T.qrFor = null;
  const sref = db.collection("sessions").doc(id);
  T.unsubSession = sref.onSnapshot(snap => {
    if (!snap.exists) {
      closeSessionPanel();
      if (!silent) toast("Session not found", "error");
      return;
    }
    T.session = { id, ...snap.data() };
    $("#session-panel").classList.remove("hidden");
    store.set("qa_last_session", id);
    renderSession();
  }, err => { toast("Live updates failed: " + err.message, "error"); });
  T.unsubEntries = sref.collection("attendance").orderBy("timeIn").onSnapshot(snap => {
    T.entries = snap.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }));
    if (T.session) renderTable();
  }, err => { toast("Live updates failed: " + err.message, "error"); });
  if (!silent) {
    switchTab("live");
    setTimeout(() => $("#session-panel").scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }
}

function isLive(s) { return s.status === "active" && (!s.expiresAt || Date.now() < s.expiresAt); }

function renderSessionStatus() {
  const s = T.session;
  if (!s) return;
  const live = isLive(s);
  const badge = $("#sp-status");
  badge.className = "badge " + (live ? "active" : "ended");
  badge.textContent = live ? "● ACTIVE" : (s.status === "active" ? "EXPIRED" : "ENDED");
  $("#btn-toggle").textContent = s.status === "active" ? "End Session" : "Reopen Session";
}

function renderQR(el, text, size) {
  el.innerHTML = "";
  if (!window.QRCode) { el.textContent = "QR library failed to load. Check your internet."; return; }
  new QRCode(el, { text, width: size, height: size, colorDark: "#0f172a", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M });
}

function renderSession() {
  const s = T.session;
  if (!s) return;
  $("#sp-title").textContent = s.title || s.className;
  $("#sp-meta").textContent = `${s.className} · ${fmtDate(s.date)} · ${s.lateTime ? "Late after " + fmtClock(s.lateTime) : "No late cutoff"}${s.expiresAt ? " · QR expires " + fmtTime(s.expiresAt) : ""}`;
  const link = studentLink(s.id);
  $("#sp-link").value = link;
  $("#sp-code").textContent = s.id;
  if (T.qrFor !== s.id + "|" + link) {
    renderQR($("#qr-box"), link, 220);
    T.qrFor = s.id + "|" + link;
  }
  if (document.activeElement !== $("#late-edit")) $("#late-edit").value = s.lateTime || "";
  renderSessionStatus();
  renderTable();
}

/* ---------- attendance table ---------- */
function entryMs(e) {
  return e.timeIn && e.timeIn.toMillis ? e.timeIn.toMillis() : (e.timeInLocal || 0);
}
function statusOf(e) {
  if (e.statusOverride) return e.statusOverride;
  const s = T.session;
  return s && s.lateAt && entryMs(e) > s.lateAt ? "Late" : "Present";
}
function currentRoster() {
  const s = T.session;
  const c = s && T.classes.find(x => x.id === s.classId);
  return c && c.roster ? c.roster : [];
}
function absentList() {
  const present = new Set(T.entries.map(e => e.nameKey));
  return currentRoster().filter(n => !present.has(nameKey(n)));
}

function renderTable() {
  const s = T.session;
  if (!s) return;
  const entries = T.entries.slice().sort((a, b) => entryMs(a) - entryMs(b));
  const counts = {};
  entries.forEach(e => { counts[e.nameKey] = (counts[e.nameKey] || 0) + 1; });
  const absent = absentList();

  let nP = 0, nL = 0;
  entries.forEach(e => (statusOf(e) === "Late" ? nL++ : nP++));
  $("#st-present").textContent = nP;
  $("#st-late").textContent = nL;
  $("#st-absent").textContent = absent.length;
  $("#st-total").textContent = entries.length;
  $("#proj-count").textContent = `${entries.length} checked in`;

  const q = T.search.trim().toLowerCase();
  const match = (...f) => !q || f.join(" ").toLowerCase().includes(q);

  let html = "", i = 0;
  entries.forEach(e => {
    const st = statusOf(e);
    if (!match(e.name, e.section, e.studentNo, st)) return;
    i++;
    const dup = counts[e.nameKey] > 1 ? `<span class="tag">DUPLICATE</span>` : "";
    const ov = e.statusOverride || "Auto";
    html += `<tr class="row-${st.toLowerCase()}" data-id="${esc(e.id)}">
      <td>${i}</td>
      <td><b>${esc(e.name)}</b>${dup}${e.manual ? ' <span class="muted small">(manual)</span>' : ""}</td>
      <td>${esc(e.section || "—")}</td>
      <td>${esc(e.studentNo || "—")}</td>
      <td>${entryMs(e) ? fmtTime(entryMs(e)) : "…"}</td>
      <td><span class="badge ${st.toLowerCase()}">${st}</span></td>
      <td class="actions no-print">
        <select class="st-sel" title="Override status">
          ${["Auto", "Present", "Late"].map(o => `<option${o === ov ? " selected" : ""}>${o}</option>`).join("")}
        </select>
        <button class="btn danger-outline btn-del" type="button">Delete</button>
      </td></tr>`;
  });
  absent.forEach(n => {
    if (!match(n, "absent")) return;
    i++;
    html += `<tr class="row-absent" data-absent="${esc(n)}">
      <td>${i}</td><td><b>${esc(n)}</b></td><td>—</td><td>—</td><td>—</td>
      <td><span class="badge absent">Absent</span></td>
      <td class="actions no-print"><button class="btn secondary btn-markp" type="button">Mark present</button></td></tr>`;
  });
  $("#att-body").innerHTML = html;
  $("#empty-note").classList.toggle("hidden", i > 0);
  $("#empty-note").textContent = q ? "No matching students." : "Waiting for students to scan the QR code…";
}

async function onTableClick(e) {
  const tr = e.target.closest("tr");
  if (!tr) return;
  const col = db.collection("sessions").doc(T.sessionId).collection("attendance");
  if (e.target.closest(".btn-del")) {
    const entry = T.entries.find(x => x.id === tr.dataset.id);
    if (!entry || !confirm(`Delete the entry for ${entry.name}?`)) return;
    try { await col.doc(entry.id).delete(); toast("Entry deleted"); }
    catch (ex) { toast(ex.message, "error"); }
  } else if (e.target.closest(".btn-markp")) {
    const name = tr.dataset.absent;
    try { await addEntry({ name, section: "", studentNo: "", status: "Auto" }); toast(name + " marked present", "success"); }
    catch (ex) { toast(ex.message, "error"); }
  }
}

async function onTableChange(e) {
  if (!e.target.classList.contains("st-sel")) return;
  const tr = e.target.closest("tr");
  const ref = db.collection("sessions").doc(T.sessionId).collection("attendance").doc(tr.dataset.id);
  const v = e.target.value;
  try {
    await ref.update({ statusOverride: v === "Auto" ? firebase.firestore.FieldValue.delete() : v });
  } catch (ex) { toast(ex.message, "error"); }
}

async function addEntry({ name, section, studentNo, status }) {
  const data = {
    name, nameKey: nameKey(name), section: section || "", studentNo: studentNo || "",
    deviceId: "manual", manual: true, timeIn: TS(), timeInLocal: Date.now()
  };
  if (status && status !== "Auto") data.statusOverride = status;
  await db.collection("sessions").doc(T.sessionId).collection("attendance").add(data);
}

async function submitAdd(e) {
  e.preventDefault();
  const name = $("#add-name").value.trim().replace(/\s+/g, " ");
  if (!name) return;
  const key = nameKey(name);
  if (T.entries.some(x => x.nameKey === key) && !confirm("Someone with this name is already in the list. Add anyway?")) return;
  try {
    await addEntry({ name, section: $("#add-section").value.trim(), studentNo: $("#add-no").value.trim(), status: $("#add-status").value });
    $("#add-form").reset();
    closeModal("modal-add");
    toast("Student added", "success");
  } catch (ex) { toast(ex.message, "error"); }
}

async function deleteAllEntries(sref) {
  const snap = await sref.collection("attendance").get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db.batch();
    snap.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

async function toggleSession() {
  const s = T.session;
  if (!s) return;
  const ref = db.collection("sessions").doc(s.id);
  try {
    if (s.status === "active") {
      if (!confirm("End this session? The QR code will stop working immediately.")) return;
      await ref.update({ status: "ended", endedAt: TS() });
      toast("Session ended – QR is now expired");
    } else {
      await ref.update({ status: "active", expiresAt: null });
      toast("Session reopened", "success");
    }
  } catch (ex) { toast(ex.message, "error"); }
}

async function clearEntries() {
  if (!T.session || !confirm("Delete ALL attendance entries for this session? This cannot be undone.")) return;
  try {
    const n = await deleteAllEntries(db.collection("sessions").doc(T.session.id));
    toast(`Cleared ${n} entr${n === 1 ? "y" : "ies"}`);
  } catch (ex) { toast(ex.message, "error"); }
}

async function saveLate() {
  const s = T.session;
  if (!s) return;
  const t = $("#late-edit").value;
  try {
    await db.collection("sessions").doc(s.id).update({
      lateTime: t || "", lateAt: t ? new Date(`${s.date}T${t}`).getTime() : null
    });
    toast(t ? "Late cutoff updated – statuses recalculated" : "Late cutoff removed", "success");
  } catch (ex) { toast(ex.message, "error"); }
}

/* ---------- export / print ---------- */
const EXPORT_HEAD = ["No.", "Name", "Section", "Student Number", "Date", "Time In", "Status"];

function exportRows() {
  const s = T.session;
  const rows = [];
  let i = 0;
  T.entries.slice().sort((a, b) => entryMs(a) - entryMs(b)).forEach(e => {
    rows.push([++i, e.name, e.section || "", e.studentNo || "", fmtDate(s.date), entryMs(e) ? fmtTime(entryMs(e)) : "", statusOf(e)]);
  });
  absentList().forEach(n => rows.push([++i, n, "", "", fmtDate(s.date), "", "Absent"]));
  return rows;
}
function fileBase() {
  const s = T.session;
  return ("Attendance_" + (s.className || "class") + "_" + s.date).replace(/[^\w\-]+/g, "_");
}
function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvCell(v) {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;          // block spreadsheet formula injection
  return `"${t.replace(/"/g, '""')}"`;
}
function exportCsv() {
  if (!T.session) return;
  const lines = [EXPORT_HEAD, ...exportRows()].map(r => r.map(csvCell).join(","));
  download(new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), fileBase() + ".csv");
}
function exportXlsx() {
  if (!T.session) return;
  if (!window.XLSX) { toast("Excel library didn't load – exporting CSV instead"); exportCsv(); return; }
  const s = T.session;
  const aoa = [
    [s.title || s.className],
    [`Class: ${s.className}   Date: ${fmtDate(s.date)}   Late after: ${s.lateTime ? fmtClock(s.lateTime) : "—"}`],
    [],
    EXPORT_HEAD,
    ...exportRows()
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 5 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 11 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.writeFile(wb, fileBase() + ".xlsx");
}
function printSheet() {
  const s = T.session;
  if (!s) return;
  const present = $("#st-present").textContent, late = $("#st-late").textContent, absent = $("#st-absent").textContent;
  $("#print-head").innerHTML = `<h2>${esc(s.title || s.className)}</h2>
    <p>${esc(s.className)} · ${esc(fmtDate(s.date))} · Late after ${esc(s.lateTime ? fmtClock(s.lateTime) : "—")}<br>
    Present: ${present} · Late: ${late} · Absent: ${absent}</p>`;
  window.print();
}

/* ---------- projector ---------- */
function openProjector() {
  const s = T.session;
  if (!s) return;
  const size = Math.max(220, Math.min(640, Math.floor(Math.min(innerWidth, innerHeight) * 0.6)));
  $("#proj-title").textContent = s.title || s.className;
  $("#proj-code").textContent = "CODE: " + s.id;
  renderQR($("#proj-qr"), studentLink(s.id), size);
  $("#proj-count").textContent = `${T.entries.length} checked in`;
  $("#projector").classList.remove("hidden");
}
function closeProjector() { $("#projector").classList.add("hidden"); }

function downloadQR() {
  const canvas = $("#qr-box canvas");
  if (!canvas) { toast("QR not ready", "error"); return; }
  const pad = 40, out = document.createElement("canvas");
  out.width = canvas.width + pad * 2; out.height = canvas.height + pad * 2;
  const c = out.getContext("2d");
  c.fillStyle = "#fff"; c.fillRect(0, 0, out.width, out.height);
  c.drawImage(canvas, pad, pad);
  out.toBlob(b => download(b, `QR_${T.session.className}_${T.session.date}`.replace(/[^\w\-]+/g, "_") + ".png"));
}

async function copyLink() {
  const v = $("#sp-link").value;
  try { await navigator.clipboard.writeText(v); }
  catch (e) { $("#sp-link").select(); document.execCommand("copy"); }
  toast("Link copied", "success");
}

/* ---------- history ---------- */
async function loadHistory() {
  const list = $("#h-list");
  list.innerHTML = `<div class="center"><div class="spinner"></div></div>`;
  try {
    const snap = await db.collection("sessions").orderBy("createdAt", "desc").limit(300).get();
    T.history = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHistory();
  } catch (ex) { list.innerHTML = `<p class="form-error">Could not load history: ${esc(ex.message)}</p>`; }
}
function renderHistory() {
  const d = $("#h-date").value, c = $("#h-class").value;
  const items = T.history
    .filter(s => (!d || s.date === d) && (!c || s.classId === c))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  $("#h-list").innerHTML = items.length ? items.map(s => {
    const live = isLive(s);
    return `<div class="h-item" data-id="${esc(s.id)}">
      <div class="h-info"><b>${esc(s.title || s.className)}</b>
        <span>${esc(s.className)} · ${esc(fmtDate(s.date))} · code ${esc(s.id)}</span></div>
      <div class="btn-row" style="margin:0">
        <span class="badge ${live ? "active" : "ended"}">${live ? "ACTIVE" : "ENDED"}</span>
        <button class="btn primary sm h-open" type="button">Open</button>
        <button class="btn danger-outline sm h-del" type="button">Delete</button>
      </div></div>`;
  }).join("") : `<p class="muted center-text">No sessions found.</p>`;
}
async function onHistoryClick(e) {
  const item = e.target.closest(".h-item");
  if (!item) return;
  const id = item.dataset.id;
  if (e.target.closest(".h-open")) { openSession(id); }
  else if (e.target.closest(".h-del")) {
    if (!confirm("Delete this session and all of its attendance records? This cannot be undone.")) return;
    try {
      const ref = db.collection("sessions").doc(id);
      await deleteAllEntries(ref);
      await ref.delete();
      if (T.sessionId === id) closeSessionPanel();
      T.history = T.history.filter(s => s.id !== id);
      renderHistory();
      toast("Session deleted");
    } catch (ex) { toast(ex.message, "error"); }
  }
}

/* ---------- settings ---------- */
async function changePin(e) {
  e.preventDefault();
  const err = $("#pc-error");
  const show = m => { err.textContent = m; err.classList.remove("hidden"); };
  const oldP = $("#pc-old").value.trim(), n1 = $("#pc-new").value.trim(), n2 = $("#pc-new2").value.trim();
  if (!/^\d{4,12}$/.test(n1)) return show("New PIN must be 4–12 digits.");
  if (n1 !== n2) return show("The new PINs don't match.");
  try {
    if (!(await verifyPin(oldP))) return show("Current PIN is wrong.");
    await db.collection("settings").doc("admin").set({ pinHash: await hashPin(n1), updatedAt: TS() });
    err.classList.add("hidden");
    $("#pc-form").reset();
    T.defaultPin = false;
    sessionStorage.setItem("qa_defpin", "0");
    $("#pin-warning").classList.add("hidden");
    toast("PIN updated", "success");
  } catch (ex) { show(ex.message); }
}

function switchTab(name) {
  $$(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
  $$(".tab-panel").forEach(p => p.classList.toggle("hidden", p.id !== "tab-" + name));
  if (name === "history") loadHistory();
}

/* ---------- wire up the dashboard ---------- */
function bindAdmin() {
  $("#btn-logout").addEventListener("click", logout);
  $$(".tab").forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  $("#btn-new-class").addEventListener("click", () => openClassModal(null));
  $("#btn-edit-class").addEventListener("click", () => { const v = $("#class-select").value; if (v) openClassModal(v); });
  $("#class-select").addEventListener("change", e => store.set("qa_class", e.target.value));
  $("#cm-form").addEventListener("submit", saveClass);
  $("#cm-cancel").addEventListener("click", () => closeModal("modal-class"));
  $("#cm-delete").addEventListener("click", deleteClass);

  $("#btn-create").addEventListener("click", createSession);
  $("#btn-copy").addEventListener("click", copyLink);
  $("#btn-dl-qr").addEventListener("click", downloadQR);
  $("#btn-project").addEventListener("click", openProjector);
  $("#proj-close").addEventListener("click", closeProjector);
  $("#btn-toggle").addEventListener("click", toggleSession);
  $("#btn-clear").addEventListener("click", clearEntries);
  $("#btn-late-save").addEventListener("click", saveLate);

  $("#search").addEventListener("input", e => { T.search = e.target.value; renderTable(); });
  $("#btn-add").addEventListener("click", () => { openModal("modal-add"); setTimeout(() => $("#add-name").focus(), 50); });
  $("#add-form").addEventListener("submit", submitAdd);
  $("#add-cancel").addEventListener("click", () => closeModal("modal-add"));
  $("#btn-csv").addEventListener("click", exportCsv);
  $("#btn-xlsx").addEventListener("click", exportXlsx);
  $("#btn-print").addEventListener("click", printSheet);
  $("#att-body").addEventListener("click", onTableClick);
  $("#att-body").addEventListener("change", onTableChange);

  $("#h-refresh").addEventListener("click", loadHistory);
  $("#h-date").addEventListener("change", renderHistory);
  $("#h-class").addEventListener("change", renderHistory);
  $("#h-list").addEventListener("click", onHistoryClick);

  $("#pc-form").addEventListener("submit", changePin);
  $("#base-form").addEventListener("submit", e => {
    e.preventDefault();
    const v = $("#base-url").value.trim();
    if (v) store.set("qa_base", v); else store.del("qa_base");
    T.qrFor = null;
    if (T.session) renderSession();
    toast("Saved – QR codes now use this address", "success");
  });
  $("#base-reset").addEventListener("click", () => {
    store.del("qa_base"); $("#base-url").value = ""; T.qrFor = null;
    if (T.session) renderSession();
    toast("Using default address");
  });

  $$(".modal").forEach(m => m.addEventListener("click", e => { if (e.target === m) m.classList.add("hidden"); }));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeProjector(); $$(".modal").forEach(m => m.classList.add("hidden")); }
  });
}

/* ---------- boot ---------- */
document.addEventListener("DOMContentLoaded", () => {
  if (document.body.dataset.page === "student") initStudent();
  else initTeacher();
});