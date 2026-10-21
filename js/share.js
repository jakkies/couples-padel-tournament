let toastTimer;
function showToast(message) {
  const toast = document.querySelector(".toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

async function fallbackCopy(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast("Link copied to clipboard.");
  } catch {
    const field = document.createElement("input");
    field.value = url; field.setAttribute("aria-label", "Copy this link");
    Object.assign(field.style, { position: "fixed", left: "1rem", bottom: "5rem", zIndex: "1001" });
    document.body.append(field); field.select();
    showToast("Select and copy the link shown.");
    window.setTimeout(() => field.remove(), 7000);
  }
}

export function initialiseSharing() {
  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-share]");
    if (!button) return;
    const data = { title: button.dataset.shareTitle || document.title, text: "Follow Pretoria P1 with Padeuce.", url: button.dataset.shareUrl || window.location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else await fallbackCopy(data.url);
    } catch (error) {
      if (error.name !== "AbortError") await fallbackCopy(data.url);
    }
  });
}
