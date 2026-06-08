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

const PROTECTED_PROJECT_PASSWORD = "980907";
const PROTECTED_PROJECT_KEY = "protected-project-unlocked";
const isProtectedProjectPage = !!document.body.dataset.protectedProjectPage;

if (isProtectedProjectPage) {
  // The unlock flag is a single-use pass: it's consumed the moment the
  // protected page loads, so leaving and coming back always re-prompts.
  const hasValidPass = sessionStorage.getItem(PROTECTED_PROJECT_KEY) === "true";
  sessionStorage.removeItem(PROTECTED_PROJECT_KEY);
  if (!hasValidPass) {
    window.location.replace("index.html#projects");
  }

  // A back/forward (bfcache) restore doesn't re-run this script, so force
  // a redirect when the page is shown from cache without a fresh password.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      window.location.replace("index.html#projects");
    }
  });
}

const protectedProjectLinks = document.querySelectorAll("[data-protected-project-link]");
const passwordModal = document.getElementById("projectPasswordModal");
const passwordForm = document.getElementById("projectPasswordForm");
const passwordInput = document.getElementById("projectPasswordInput");
const passwordError = document.getElementById("projectPasswordError");
const passwordCancel = document.getElementById("projectPasswordCancel");

let protectedProjectHref = "";
let passwordModalPreviousFocus = null;

function openPasswordModal(targetHref) {
  if (!passwordModal || !passwordInput || !passwordError) return;
  protectedProjectHref = targetHref;
  passwordModalPreviousFocus = document.activeElement;
  passwordInput.value = "";
  passwordError.textContent = "";
  passwordModal.hidden = false;
  document.body.classList.add("modal-open");
  passwordInput.focus();
}

function closePasswordModal() {
  if (!passwordModal) return;
  passwordModal.hidden = true;
  document.body.classList.remove("modal-open");
  if (passwordModalPreviousFocus) {
    passwordModalPreviousFocus.focus();
  }
}

protectedProjectLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    openPasswordModal(link.href);
  });
});

if (passwordForm && passwordInput && passwordError) {
  passwordForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (passwordInput.value === PROTECTED_PROJECT_PASSWORD) {
      sessionStorage.setItem(PROTECTED_PROJECT_KEY, "true");
      window.location.href = protectedProjectHref;
      return;
    }

    passwordError.textContent = "Incorrect password. Please try again.";
    passwordInput.select();
  });
}

if (passwordCancel) {
  passwordCancel.addEventListener("click", closePasswordModal);
}

if (passwordModal) {
  passwordModal.addEventListener("click", (event) => {
    if (event.target === passwordModal) {
      closePasswordModal();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !passwordModal.hidden) {
      closePasswordModal();
    }
  });
}

const experienceModalTriggers = document.querySelectorAll("[data-experience-modal-trigger]");
let experienceModalPreviousFocus = null;

function openExperienceModal(modal) {
  if (!modal) return;
  experienceModalPreviousFocus = document.activeElement;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  const closeBtn = modal.querySelector("[data-experience-modal-close]");
  if (closeBtn) closeBtn.focus();
}

function closeExperienceModal(modal) {
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  if (experienceModalPreviousFocus && typeof experienceModalPreviousFocus.focus === "function") {
    experienceModalPreviousFocus.focus();
  }
}

experienceModalTriggers.forEach((trigger) => {
  const targetId = `${trigger.dataset.experienceModalTrigger}ExperienceModal`;
  const modal = document.getElementById(targetId);
  if (!modal) return;

  const openHandler = (event) => {
    event.preventDefault();
    openExperienceModal(modal);
  };

  trigger.addEventListener("click", openHandler);
  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openExperienceModal(modal);
    }
  });

  modal.querySelectorAll("[data-experience-modal-close]").forEach((btn) => {
    btn.addEventListener("click", () => closeExperienceModal(modal));
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeExperienceModal(modal);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeExperienceModal(modal);
  });
});

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

const projectCards = Array.from(document.querySelectorAll("#projects .card-grid .pixel-card"));
const projectFilterButtons = Array.from(document.querySelectorAll("[data-project-filter]"));

function projectCardMatchesFilter(cardEl, filterValue) {
  if (filterValue === "all") return true;
  return cardEl.classList.contains(`project-${filterValue}`);
}

function applyProjectFilter(filterValue) {
  projectCards.forEach((cardEl) => {
    const shouldShow = projectCardMatchesFilter(cardEl, filterValue);
    cardEl.classList.toggle("is-filter-hidden", !shouldShow);
  });

  projectFilterButtons.forEach((btn) => {
    const active = btn.dataset.projectFilter === filterValue;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

if (projectCards.length > 0 && projectFilterButtons.length > 0) {
  projectFilterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const filterValue = btn.dataset.projectFilter || "all";
      applyProjectFilter(filterValue);
    });
  });
}
