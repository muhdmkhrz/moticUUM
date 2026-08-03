const menuButton = document.querySelector(".menu-button");
const closeButton = document.querySelector(".menu-close");
const navigationMenu = document.querySelector(".navigation-menu");
const menuOverlay = document.querySelector(".menu-overlay");
const currentYear = document.querySelector("#current-year");

let previouslyFocusedElement = null;

function openMenu() {
  previouslyFocusedElement = document.activeElement;

  navigationMenu.classList.add("open");
  menuOverlay.hidden = false;
  document.body.classList.add("menu-open");
  menuButton.setAttribute("aria-expanded", "true");

  closeButton.focus();
}

function closeMenu() {
  navigationMenu.classList.remove("open");
  menuOverlay.hidden = true;
  document.body.classList.remove("menu-open");
  menuButton.setAttribute("aria-expanded", "false");

  previouslyFocusedElement?.focus();
}

menuButton?.addEventListener("click", openMenu);
closeButton?.addEventListener("click", closeMenu);
menuOverlay?.addEventListener("click", closeMenu);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navigationMenu?.classList.contains("open")) {
    closeMenu();
  }
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 1023 && navigationMenu?.classList.contains("open")) {
    closeMenu();
  }
});

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

// Accessible "About Us" dropdown in the main navigation
document.querySelectorAll(".nav-dropdown").forEach((dropdown) => {
  const trigger = dropdown.querySelector(".nav-dropdown__toggle");
  const menu = dropdown.querySelector(".nav-dropdown__menu");

  if (!trigger || !menu) return;

  function openDropdown() {
    dropdown.classList.add("open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function closeDropdown() {
    dropdown.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (dropdown.classList.contains("open")) {
      closeDropdown();
    } else {
      openDropdown();
    }
  });

  dropdown.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDropdown();
      trigger.focus();
    }
  });
});

document.addEventListener("click", (event) => {
  document.querySelectorAll(".nav-dropdown.open").forEach((dropdown) => {
    if (!dropdown.contains(event.target)) {
      dropdown.classList.remove("open");
      dropdown.querySelector(".nav-dropdown__toggle")?.setAttribute("aria-expanded", "false");
    }
  });
});

// Footer "back to top" control
document.querySelector(".back-to-top")?.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});