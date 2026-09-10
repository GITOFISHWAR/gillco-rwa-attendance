/* Disclaimer modal — shown on first browser load until user agrees */
(function () {
  const KEY = "gillco_disclaimer_accepted";
  let accepted = false;
  try { accepted = localStorage.getItem(KEY) === "yes"; } catch {}

  if (accepted) return; // already agreed — do nothing

  const overlay = document.getElementById("disclaimerOverlay");
  const checkbox = document.getElementById("disclaimerAgree");
  const acceptBtn = document.getElementById("disclaimerAccept");
  if (!overlay || !checkbox || !acceptBtn) return;

  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  checkbox.addEventListener("change", () => {
    acceptBtn.disabled = !checkbox.checked;
  });

  acceptBtn.addEventListener("click", () => {
    if (!checkbox.checked) return;
    try { localStorage.setItem(KEY, "yes"); } catch {}
    overlay.classList.add("hidden");
    document.body.style.overflow = "";
  });
})();
