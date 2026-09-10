/* Shared utilities for Gillco RWA Attendance */
window.api = async function (path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    credentials: "same-origin",
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  const txt = await res.text();
  try { data = txt ? JSON.parse(txt) : null; } catch { data = { raw: txt }; }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
};

window.toast = function (msg, type = "") {
  const host = document.getElementById("toastHost");
  if (!host) return alert(msg);
  const el = document.createElement("div");
  el.className = "toast " + type;
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = ".3s"; setTimeout(() => el.remove(), 300); }, 3200);
};

window.fmtDate = function (iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

window.todayISO = function () {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
};

/* Wire up logout buttons + admin chip visibility globally */
(async function bootNav() {
  const navAdmin = document.getElementById("navAdmin");
  const navLogin = document.getElementById("navLogin");
  const navAdminName = document.getElementById("navAdminName");
  try {
    const me = await api("/api/me");
    if (me.ok && me.admin) {
      if (navAdmin) navAdmin.classList.remove("hidden");
      if (navLogin) navLogin.classList.add("hidden");
      if (navAdminName) navAdminName.textContent = me.admin.username;
    }
  } catch { /* not logged in — fine */ }

  const btn = document.getElementById("btnLogout");
  if (btn) btn.addEventListener("click", async () => {
    try { await api("/api/logout", { method: "POST" }); } catch {}
    window.location.href = "/login.html";
  });
})();

/* CSV export link guard — redirect to login if session expired */
window.guardDownload = function (selector, href) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      const me = await api("/api/me");
      if (!me.ok) { window.location.href = "/login.html"; return; }
      // session valid — trigger real download
      window.location.href = href;
    } catch {
      window.location.href = "/login.html";
    }
  }, true);
};
