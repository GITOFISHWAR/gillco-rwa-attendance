/* Admin sign-in */
document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errBox = document.getElementById("loginError");
  errBox.classList.add("hidden");
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true; btn.textContent = "Signing in…";
  try {
    const r = await api("/api/login", { method: "POST", body: { username, password } });
    if (r.ok) {
      toast("Signed in ✓", "success");
      setTimeout(() => window.location.href = "/admin.html", 400);
    }
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Sign In";
  }
});
