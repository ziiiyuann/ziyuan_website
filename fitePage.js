const loadFiteChartsBtn = document.getElementById("loadFiteChartsBtn");
const fiteChartsGrid = document.getElementById("fiteChartsGrid");
const fiteChartsStatus = document.getElementById("fiteChartsStatus");

function attachMissingHandler(img) {
  img.addEventListener("error", () => {
    img.classList.add("is-missing");
    const hint = img.closest(".fite-chart-card")?.querySelector(".fite-chart-hint");
    if (hint) {
      hint.hidden = false;
    }
  });
}

function loadFiteCharts() {
  if (!fiteChartsGrid) return;

  const images = fiteChartsGrid.querySelectorAll("img[data-src]");
  images.forEach((img) => {
    attachMissingHandler(img);
    img.src = img.dataset.src;
    img.removeAttribute("data-src");
  });

  fiteChartsGrid.hidden = false;
  if (fiteChartsStatus) {
    fiteChartsStatus.textContent = "Charts loaded. If any are missing, check the file names in assets/images/fite/.";
  }
  if (loadFiteChartsBtn) {
    loadFiteChartsBtn.textContent = "Charts Loaded";
    loadFiteChartsBtn.disabled = true;
  }
}

if (loadFiteChartsBtn) {
  loadFiteChartsBtn.addEventListener("click", loadFiteCharts);
}
