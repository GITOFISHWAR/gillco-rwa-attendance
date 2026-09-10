/* Admin dashboard — members + attendance + settings */
let allMembers = [];
let currentThreshold = 70;
const attState = {}; // memberId -> "present" | "absent"

/* ---------- Auth gate ---------- */
(async function gate() {
  try {
    const me = await api("/api/me");
    if (!me.ok) throw new Error();
  } catch {
    window.location.href = "/login.html";
    return;
  }
  init();
})();

async function init() {
  setSeqHint();
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );
  document.getElementById("attDate").value = todayISO();

  document.getElementById("memberForm").addEventListener("submit", onAddMember);
  document.getElementById("loadSheet").addEventListener("click", loadSheet);
  document.getElementById("saveAttendance").addEventListener("click", saveAttendance);
  document.getElementById("markAllPresent").addEventListener("click", () => setAll("present"));
  document.getElementById("markAllAbsent").addEventListener("click", () => setAll("absent"));
  document.getElementById("clearAll").addEventListener("click", () => setAll(null));

  // Search filter
  const search = document.getElementById("flatSearch");
  if (search) search.addEventListener("input", renderMembers);

  // Settings
  const saveThr = document.getElementById("saveThreshold");
  if (saveThr) saveThr.addEventListener("click", saveThreshold);

  await loadMembers();
  await loadSheets();
  await loadThreshold();
}

function switchTab(tab) {
  document.querySelectorAll(".tabs button").forEach((b) =>
    b.classList.toggle("active", b.dataset.tab === tab)
  );
  document.getElementById("tab-members").classList.toggle("hidden", tab !== "members");
  document.getElementById("tab-attendance").classList.toggle("hidden", tab !== "attendance");
  document.getElementById("tab-settings").classList.toggle("hidden", tab !== "settings");
  if (tab === "attendance") renderMarkList();
}

function setSeqHint() {
  const d = new Date();
  const hint = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}01`;
  const el = document.getElementById("seqHint");
  if (el) el.textContent = hint;
}

/* ---------- Members ---------- */
async function loadMembers() {
  try {
    const r = await api("/api/members");
    allMembers = r.members || [];
    renderMembers();
    renderMarkList();
  } catch (err) { toast(err.message, "error"); }
}

function renderMembers() {
  const body = document.getElementById("memberTableBody");
  const dirCount = document.getElementById("dirCount");
  const searchEl = document.getElementById("flatSearch");
  const q = (searchEl ? searchEl.value : "").trim().toLowerCase();

  const filtered = q
    ? allMembers.filter((m) => m.flatNumber.toLowerCase().includes(q))
    : allMembers;

  if (dirCount) {
    dirCount.textContent = q
      ? `${filtered.length} of ${allMembers.length} members`
      : `${allMembers.length} members`;
  }

  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="6"><div class="empty"><div class="ic">${q ? "🔎" : "👥"}</div><h3>${q ? "No matches" : "No members yet"}</h3><p>${q ? "Try a different flat number." : "Add your first member using the form."}</p></div></td></tr>`;
    return;
  }
  body.innerHTML = filtered
    .map(
      (m) => `<tr>
        <td><span class="code">${m.memberId}</span></td>
        <td>${esc(m.name)}</td>
        <td>${m.age ?? "—"}</td>
        <td>${esc(m.flatNumber)}</td>
        <td>${fmtDate(m.onboardedDate)}</td>
        <td><button class="btn btn-sm btn-danger" data-del="${m.memberId}">Delete</button></td>
      </tr>`
    )
    .join("");
  body.querySelectorAll("[data-del]").forEach((btn) =>
    btn.addEventListener("click", () => onDeleteMember(btn.dataset.del))
  );
}

async function onAddMember(e) {
  e.preventDefault();
  const msg = document.getElementById("memberMsg");
  msg.className = "alert hidden";
  const body = {
    name: document.getElementById("mName").value.trim(),
    age: document.getElementById("mAge").value,
    flatNumber: document.getElementById("mFlat").value.trim(),
  };
  if (!body.name || !body.flatNumber) {
    msg.className = "alert alert-error";
    msg.textContent = "Name and Flat Number are required.";
    return;
  }
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    const r = await api("/api/members", { method: "POST", body });
    toast(`Added ${r.member.name} · ${r.member.memberId}`, "success");
    document.getElementById("memberForm").reset();
    await loadMembers();
  } catch (err) {
    msg.className = "alert alert-error";
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function onDeleteMember(id) {
  if (!confirm(`Delete member ${id}? This cannot be undone.`)) return;
  try {
    await api(`/api/members/${id}`, { method: "DELETE" });
    toast("Member deleted", "success");
    await loadMembers();
  } catch (err) { toast(err.message, "error"); }
}

/* ---------- Attendance marking ---------- */
function renderMarkList() {
  const list = document.getElementById("markList");
  if (!allMembers.length) {
    list.innerHTML = `<div class="empty"><div class="ic">📝</div><h3>No members to mark</h3><p>Add members first.</p></div>`;
    return;
  }
  list.innerHTML = allMembers
    .map((m) => {
      const s = attState[m.memberId] || "";
      return `<div class="mark-row" data-mid="${m.memberId}">
        <div class="mark-info">
          <div class="name">${esc(m.name)} <span class="code">${m.memberId}</span></div>
          <div class="meta">Flat ${esc(m.flatNumber)}${m.age ? " · Age " + m.age : ""}</div>
        </div>
        <div class="mark-buttons">
          <button class="btn btn-sm btn-present ${s === "present" ? "active" : ""}" data-set="present">Present</button>
          <button class="btn btn-sm btn-absent ${s === "absent" ? "active" : ""}" data-set="absent">Absent</button>
        </div>
      </div>`;
    })
    .join("");
  list.querySelectorAll(".mark-row").forEach((row) => {
    const mid = row.dataset.mid;
    row.querySelectorAll("[data-set]").forEach((btn) =>
      btn.addEventListener("click", () => setMark(mid, btn.dataset.set, row))
    );
  });
}

function setMark(mid, status, row) {
  if (attState[mid] === status) {
    delete attState[mid];
  } else {
    attState[mid] = status;
  }
  row.querySelectorAll("[data-set]").forEach((b) => {
    b.classList.toggle("active", attState[mid] === b.dataset.set);
  });
}

function setAll(status) {
  for (const m of allMembers) {
    if (status) attState[m.memberId] = status;
    else delete attState[m.memberId];
  }
  renderMarkList();
}

async function loadSheet() {
  const date = document.getElementById("attDate").value;
  if (!date) { toast("Pick a date first.", "error"); return; }
  for (const k of Object.keys(attState)) delete attState[k];
  try {
    const r = await api("/api/attendance");
    const sheet = (r.sheets || []).find((s) => s.date === date);
    if (sheet) {
      for (const rec of sheet.records || []) attState[rec.memberId] = rec.status;
      toast(`Loaded sheet for ${date}`, "success");
    } else {
      toast(`No sheet for ${date} — fresh start.`, "");
    }
    renderMarkList();
  } catch (err) { toast(err.message, "error"); }
}

async function saveAttendance() {
  const date = document.getElementById("attDate").value;
  if (!date) { toast("Pick a date first.", "error"); return; }
  const records = allMembers
    .filter((m) => attState[m.memberId])
    .map((m) => ({
      memberId: m.memberId,
      name: m.name,
      flatNumber: m.flatNumber,
      status: attState[m.memberId],
    }));
  if (!records.length) { toast("Mark at least one member before saving.", "error"); return; }
  const btn = document.getElementById("saveAttendance");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    await api("/api/attendance", { method: "POST", body: { date, records } });
    toast(`Attendance saved for ${date} (${records.length} marked)`, "success");
    await loadSheets();
  } catch (err) { toast(err.message, "error"); }
  finally { btn.disabled = false; btn.textContent = "Save Attendance"; }
}

async function loadSheets() {
  const body = document.getElementById("sheetsBody");
  try {
    const r = await api("/api/attendance");
    const sheets = (r.sheets || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!sheets.length) {
      body.innerHTML = `<tr><td colspan="4"><div class="empty"><h3>No attendance sheets yet</h3></div></td></tr>`;
      return;
    }
    body.innerHTML = sheets
      .map((s) => {
        const recs = s.records || [];
        const present = recs.filter((r) => r.status === "present").length;
        const absent = recs.filter((r) => r.status === "absent").length;
        return `<tr>
          <td><strong>${s.date}</strong></td>
          <td>${recs.length}</td>
          <td><span class="badge badge-good">${present}</span></td>
          <td><span class="badge badge-bad">${absent}</span></td>
        </tr>`;
      })
      .join("");
  } catch (err) { body.innerHTML = `<tr><td colspan="4">${esc(err.message)}</td></tr>`; }
}

/* ---------- Settings (threshold) ---------- */
async function loadThreshold() {
  try {
    const r = await api("/api/settings");
    currentThreshold = r.threshold ?? 70;
    const input = document.getElementById("thresholdInput");
    if (input) input.value = currentThreshold;
  } catch { /* keep default */ }
}

async function saveThreshold() {
  const input = document.getElementById("thresholdInput");
  const msg = document.getElementById("thresholdMsg");
  const val = Number(input.value);
  msg.className = "alert hidden";
  const btn = document.getElementById("saveThreshold");
  btn.disabled = true;
  try {
    const r = await api("/api/settings", { method: "POST", body: { threshold: val } });
    currentThreshold = r.threshold;
    msg.className = "alert alert-success";
    msg.textContent = `Minimum attendance set to ${r.threshold}%.`;
    toast(`Threshold updated to ${r.threshold}%`, "success");
  } catch (err) {
    msg.className = "alert alert-error";
    msg.textContent = err.message;
  } finally { btn.disabled = false; }
}

/* ---------- helpers ---------- */
const _escEl = document.createElement("div");
function esc(s) {
  _escEl.textContent = String(s ?? "");
  return _escEl.innerHTML;
}
