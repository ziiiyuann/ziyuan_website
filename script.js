const yearEl = document.getElementById("year");
if (yearEl) {
  yearEl.textContent = `(c) ${new Date().getFullYear()} Ziyuan Wang. All rights reserved.`;
}

const themeBtn = document.getElementById("themeBtn");
const THEME_KEY = "portfolio-theme";

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  if (themeBtn) {
    themeBtn.textContent = `Theme: ${theme === "light" ? "Light" : "Dark"}`;
  }
}

const savedTheme = localStorage.getItem(THEME_KEY);
const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
const initialTheme = savedTheme || (systemPrefersLight ? "light" : "dark");
setTheme(initialTheme);

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    const currentTheme = document.body.getAttribute("data-theme") === "light" ? "light" : "dark";
    const nextTheme = currentTheme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    localStorage.setItem(THEME_KEY, nextTheme);
  });
}

const menuBtn = document.getElementById("menuBtn");
const nav = document.getElementById("nav");

if (menuBtn && nav) {
  menuBtn.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
    });
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.2 }
);

document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
