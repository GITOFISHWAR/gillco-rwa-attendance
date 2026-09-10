/* Public attendance view — flat summary + date-wise sheets */
const _escEl = document.createElement("div");
function esc(s) {
  _escEl.textContent = String(s ?? "");
  return _escEl.innerHTML;
}

async function loadSummary() {
  const sub = document.getElementById("summarySub");
  const body = document.getElementById("summaryBody");
  const stats = document.getElementById("stats");
  const legend = document.getElementById("legend");
  try {
    const r = await api("/api/attendance/summary");
    const summary = r.summary || [];
    const threshold = r.threshold ?? 70;

    if (legend) legend.innerHTML =
      `<span><span class="dot dot-ok"></span>≥ ${threshold}%</span>` +
      `<span><span class="dot dot-low"></span>&lt; ${threshold}%</span>`;

    if (!summary.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="empty"><div class="ic">🏠</div><h3>No members yet</h3><p>Once the admin adds members and records attendance, flats appear here.</p></div></td></tr>`;
      sub.textContent = "No data yet.";
      stats.innerHTML = "";
      return;
    }

    const totalFlats = summary.length;
    const lowFlats = summary.filter((s) => s.status === "low").length;
    const avgPct = summary.length
      ? Math.round((summary.reduce((a, s) => a + s.percentage, 0) / summary.length) * 10) / 10
      : 0;
    const totalMembers = summary.reduce((a, s) => a + s.memberCount, 0);

    stats.innerHTML = `
      <div class="stat"><div class="label">Total Flats</div><div class="val teal">${totalFlats}</div></div>
      <div class="stat"><div class="label">Members</div><div class="val">${totalMembers}</div></div>
      <div class="stat"><div class="label">Avg Attendance</div><div class="val ${avgPct >= threshold ? "good" : "bad"}">${avgPct}%</div></div>
      <div class="stat"><div class="label">Flats Below ${threshold}%</div><div class="val ${lowFlats ? "bad" : "good"}">${lowFlats}</div></div>`;

    sub.textContent = `${totalFlats} flats · threshold ${threshold}%`;

    body.innerHTML = summary
      .map((s) => {
        const low = s.status === "low";
        return `<tr class="${low ? "row-low" : "row-ok"}">
          <td><strong>${esc(s.flatNumber)}</strong></td>
          <td>${esc(s.members)}</td>
          <td>${s.memberCount}</td>
          <td>${s.present}</td>
          <td>${s.total}</td>
          <td class="pct">${s.percentage}%</td>
          <td><span class="badge ${low ? "badge-bad" : "badge-good"}">${low ? "Below " + threshold + "%" : "OK"}</span></td>
        </tr>`;
      })
      .join("");
  } catch (err) {
    sub.textContent = "Failed to load.";
    body.innerHTML = `<tr><td colspan="7"><div class="empty"><h3>${esc(err.message)}</h3></div></td></tr>`;
  }
}

async function loadDates() {
  const host = document.getElementById("datesBody");
  try {
    const r = await api("/api/attendance");
    const sheets = (r.sheets || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!sheets.length) return; // keep empty state

    host.innerHTML = sheets
      .map((s) => {
        const recs = s.records || [];
        const present = recs.filter((x) => x.status === "present").length;
        const pct = recs.length ? Math.round((present / recs.length) * 100) : 0;
        return `<div class="card" style="margin-bottom:14px;">
          <div class="card-head">
            <div><h2>${esc(s.date)}</h2><p>${recs.length} members · ${present} present</p></div>
            <span class="badge ${pct >= 70 ? "badge-good" : "badge-bad"}">${pct}%</span>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr><th>Member</th><th>Flat</th><th>Status</th></tr></thead>
              <tbody>
                ${recs
                  .map((rec) => `<tr>
                    <td>${esc(rec.name)} <span class="code">${esc(rec.memberId)}</span></td>
                    <td>${esc(rec.flatNumber)}</td>
                    <td><span class="badge ${rec.status === "present" ? "badge-good" : "badge-bad"}">${rec.status}</span></td>
                  </tr>`)
                  .join("")}
              </tbody>
            </table>
          </div>
        </div>`;
      })
      .join("");
  } catch (err) {
    host.innerHTML = `<div class="empty"><h3>${esc(err.message)}</h3></div>`;
  }
}

loadSummary();
loadDates();
