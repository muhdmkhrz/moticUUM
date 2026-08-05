/* global homePageData, newsData */

const menuButton = document.querySelector(".menu-button");
const closeButton = document.querySelector(".menu-close");
const navigationMenu = document.querySelector(".navigation-menu");
const menuOverlay = document.querySelector(".menu-overlay");
const currentYear = document.querySelector("#current-year");

let previouslyFocusedElement = null;

const mobileNavigationQuery = window.matchMedia("(max-width: 1023px)");

function navigationFocusableElements() {
  if (!navigationMenu) return [];

  return [...navigationMenu.querySelectorAll(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter(
    (element) =>
      !element.hidden &&
      element.getClientRects().length > 0
  );
}

function syncNavigationState() {
  if (!navigationMenu) return;

  const menuIsOpen =
    navigationMenu.classList.contains("open");

  navigationMenu.inert =
    mobileNavigationQuery.matches && !menuIsOpen;
}

function openMenu() {
  if (!navigationMenu || !menuOverlay || !menuButton) return;

  previouslyFocusedElement = document.activeElement;
  navigationMenu.classList.add("open");
  navigationMenu.inert = false;
  menuOverlay.hidden = false;
  document.body.classList.add("menu-open");
  menuButton.setAttribute("aria-expanded", "true");
  closeButton?.focus();
}

function closeMenu() {
  if (!navigationMenu || !menuOverlay || !menuButton) return;

  navigationMenu.classList.remove("open");
  menuOverlay.hidden = true;
  document.body.classList.remove("menu-open");
  menuButton.setAttribute("aria-expanded", "false");
  syncNavigationState();
  previouslyFocusedElement?.focus();
}

menuButton?.addEventListener("click", openMenu);
closeButton?.addEventListener("click", closeMenu);
menuOverlay?.addEventListener("click", closeMenu);

document.addEventListener("keydown", (event) => {
  const menuIsOpen =
    navigationMenu?.classList.contains("open");

  if (event.key === "Escape" && menuIsOpen) {
    closeMenu();
  }

  if (
    event.key === "Tab" &&
    menuIsOpen &&
    mobileNavigationQuery.matches
  ) {
    const focusableElements =
      navigationFocusableElements();

    const firstElement = focusableElements[0];
    const lastElement = focusableElements.at(-1);

    if (!firstElement || !lastElement) return;

    if (
      event.shiftKey &&
      document.activeElement === firstElement
    ) {
      event.preventDefault();
      lastElement.focus();
    } else if (
      !event.shiftKey &&
      document.activeElement === lastElement
    ) {
      event.preventDefault();
      firstElement.focus();
    }
  }
});

function handleNavigationViewportChange() {
  if (
    !mobileNavigationQuery.matches &&
    navigationMenu?.classList.contains("open")
  ) {
    closeMenu();
  }

  syncNavigationState();
}

mobileNavigationQuery.addEventListener?.(
  "change",
  handleNavigationViewportChange
);

window.addEventListener(
  "resize",
  handleNavigationViewportChange
);

navigationMenu
  ?.querySelectorAll("a[href]")
  .forEach((link) => {
    link.addEventListener("click", () => {
      if (mobileNavigationQuery.matches) {
        closeMenu();
      }
    });
  });

syncNavigationState();

if (currentYear) {
  currentYear.textContent = new Date().getFullYear();
}

const posterCarousel =
  document.querySelector("[data-poster-carousel]");

if (posterCarousel) {
  initialisePosterCarousel();
}

async function initialisePosterCarousel() {
  const fallbackPosters =
    typeof homePageData !== "undefined" &&
    Array.isArray(homePageData.homePosters)
      ? homePageData.homePosters
      : [];

  let posters = fallbackPosters;

  try {
    if (window.newsService) {
      posters = await window.newsService.getAllPosters();
    }
  } catch (error) {
    console.warn("Posters could not be loaded.", error);
    posters = fallbackPosters;
  }

  posters = posters.filter(
    (poster) =>
      poster?.image &&
      poster.isActive !== false
  );

  const track =
    posterCarousel.querySelector("[data-carousel-track]");

  const previousButton =
    posterCarousel.querySelector("[data-carousel-previous]");

  const nextButton =
    posterCarousel.querySelector("[data-carousel-next]");

  const dotsContainer =
    posterCarousel.querySelector("[data-carousel-dots]");

  const status =
    posterCarousel.querySelector("[data-carousel-status]");

  const viewport =
    posterCarousel.querySelector(
      ".announcement-carousel__viewport"
    );

  const autoplayDelay =
    Number(posterCarousel.dataset.autoplayDelay) || 6500;

  const reduceMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );

  let activeIndex = 0;
  let autoplayTimer = null;
  let touchStartX = null;

  function createSlide(poster, index) {
    const slide = document.createElement("article");

    slide.className = "announcement-slide";
    slide.setAttribute("role", "group");
    slide.setAttribute(
      "aria-roledescription",
      "slide"
    );
    slide.setAttribute(
      "aria-label",
      `${index + 1} of ${posters.length}: ${
        poster.title || "Announcement"
      }`
    );

    const image = document.createElement("img");

    image.className = "announcement-slide__image";
    image.src = poster.image;
    image.alt =
      poster.alt ||
      poster.title ||
      "Upcoming announcement poster";

    image.loading = index === 0 ? "eager" : "lazy";
    image.decoding = "async";

    if (index === 0) {
      image.fetchPriority = "high";
    }

    if (poster.link) {
      const link = document.createElement("a");

      link.className = "announcement-slide__link";
      link.href = poster.link;
      link.setAttribute(
        "aria-label",
        poster.title
          ? `Read more: ${poster.title}`
          : "Read announcement details"
      );

      link.append(image);
      slide.append(link);
    } else {
      slide.append(image);
    }

    return slide;
  }

  function createDot(poster, index) {
    const dot = document.createElement("button");

    dot.className = "carousel-dot";
    dot.type = "button";
    dot.setAttribute(
      "aria-label",
      `Show poster ${index + 1}: ${
        poster.title || "Announcement"
      }`
    );

    dot.addEventListener("click", () => {
      showSlide(index, true);
      restartAutoplay();
    });

    return dot;
  }

  function showSlide(index, announce = false) {
    if (!posters.length || !track || !dotsContainer) {
      return;
    }

    activeIndex =
      (index + posters.length) % posters.length;

    track.style.transform =
      `translateX(-${activeIndex * 100}%)`;

    [...track.children].forEach(
      (slide, slideIndex) => {
        const isActive =
          slideIndex === activeIndex;

        slide.setAttribute(
          "aria-hidden",
          String(!isActive)
        );

        slide
          .querySelectorAll("a, button")
          .forEach((control) => {
            control.tabIndex =
              isActive ? 0 : -1;
          });
      }
    );

    [...dotsContainer.children].forEach(
      (dot, dotIndex) => {
        dot.setAttribute(
          "aria-current",
          String(dotIndex === activeIndex)
        );
      }
    );

    if (announce && status) {
      const poster = posters[activeIndex];

      status.textContent =
        `Poster ${activeIndex + 1} of ${posters.length}: ${
          poster.title || "Announcement"
        }`;
    }
  }

  function stopAutoplay() {
    window.clearInterval(autoplayTimer);
    autoplayTimer = null;
  }

  function startAutoplay() {
    stopAutoplay();

    if (
      posters.length < 2 ||
      reduceMotion.matches ||
      document.hidden
    ) {
      return;
    }

    autoplayTimer = window.setInterval(
      () => showSlide(activeIndex + 1),
      autoplayDelay
    );
  }

  function restartAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  if (!posters.length || !track || !dotsContainer) {
    posterCarousel.dataset.empty = "true";
    return;
  }

  posters.forEach((poster, index) => {
    track.append(createSlide(poster, index));
    dotsContainer.append(createDot(poster, index));
  });

  posterCarousel.classList.toggle(
    "is-single",
    posters.length === 1
  );

  showSlide(0);
  startAutoplay();

  previousButton?.addEventListener("click", () => {
    showSlide(activeIndex - 1, true);
    restartAutoplay();
  });

  nextButton?.addEventListener("click", () => {
    showSlide(activeIndex + 1, true);
    restartAutoplay();
  });

  viewport?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showSlide(activeIndex - 1, true);
      restartAutoplay();
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      showSlide(activeIndex + 1, true);
      restartAutoplay();
    }
  });

  viewport?.addEventListener(
    "touchstart",
    (event) => {
      touchStartX =
        event.changedTouches[0]?.clientX ?? null;
    },
    {
      passive: true,
    }
  );

  viewport?.addEventListener(
    "touchend",
    (event) => {
      if (touchStartX === null) return;

      const distance =
        (event.changedTouches[0]?.clientX ??
          touchStartX) -
        touchStartX;

      touchStartX = null;

      if (Math.abs(distance) < 48) return;

      showSlide(
        activeIndex + (distance < 0 ? 1 : -1),
        true
      );

      restartAutoplay();
    },
    {
      passive: true,
    }
  );

  posterCarousel.addEventListener(
    "mouseenter",
    stopAutoplay
  );

  posterCarousel.addEventListener(
    "mouseleave",
    startAutoplay
  );

  posterCarousel.addEventListener(
    "focusin",
    stopAutoplay
  );

  posterCarousel.addEventListener(
    "focusout",
    (event) => {
      if (!posterCarousel.contains(event.relatedTarget)) {
        startAutoplay();
      }
    }
  );

  reduceMotion.addEventListener?.(
    "change",
    startAutoplay
  );

  document.addEventListener(
    "visibilitychange",
    startAutoplay
  );
}

const latestNewsContainer =
  document.querySelector("[data-latest-news]");

const inHouseNewsContainer =
  document.querySelector("[data-in-house-news]");

if (latestNewsContainer || inHouseNewsContainer) {
  renderHomepageNews();
}

function formatNewsDate(date, options) {
  return new Intl.DateTimeFormat(
    "en-MY",
    options
  ).format(new Date(`${date}T12:00:00`));
}

function createTextElement(
  tagName,
  className,
  text
) {
  const element =
    document.createElement(tagName);

  element.className = className;
  element.textContent = text;

  return element;
}

function localNewsItems() {
  if (
    typeof newsData === "undefined" ||
    !Array.isArray(newsData.items)
  ) {
    return [];
  }

  return [...newsData.items].sort(
    (first, second) =>
      new Date(second.date) -
      new Date(first.date)
  );
}

function renderLatestNews(item) {
  if (!latestNewsContainer || !item) return;

  const detailUrl =
    `pages/news-detail.html?id=${
      encodeURIComponent(item.id)
    }`;

  if (item.image) {
    const imageLink =
      document.createElement("a");

    imageLink.className =
      "latest-news-card__media";

    imageLink.href = detailUrl;

    const image =
      document.createElement("img");

    image.src = item.image;
    image.alt = item.imageAlt || item.title;
    image.loading = "lazy";
    image.decoding = "async";

    imageLink.append(image);
    latestNewsContainer.append(imageLink);
  }

  const content =
    document.createElement("div");

  content.className =
    "latest-news-card__content";

  content.append(
    createTextElement(
      "p",
      "latest-news-card__meta",
      `${item.category} · ${formatNewsDate(
        item.date,
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      )}`
    )
  );

  const title =
    document.createElement("h4");

  title.className =
    "latest-news-card__title";

  const titleLink =
    document.createElement("a");

  titleLink.href = detailUrl;
  titleLink.textContent = item.title;

  title.append(titleLink);
  content.append(title);

  content.append(
    createTextElement(
      "p",
      "latest-news-card__excerpt",
      item.excerpt
    )
  );

  const readMore =
    document.createElement("a");

  readMore.className =
    "latest-news-card__link";

  readMore.href = detailUrl;
  readMore.textContent = "Read More →";

  content.append(readMore);
  latestNewsContainer.append(content);
}

function renderInHouseNews(items) {
  if (!inHouseNewsContainer) return;

  items.forEach((item) => {
    const article =
      document.createElement("article");

    article.className = "in-house-item";

    const date =
      document.createElement("time");

    date.className = "in-house-item__date";
    date.dateTime = item.date;

    date.append(
      createTextElement(
        "strong",
        "in-house-item__day",
        formatNewsDate(item.date, {
          day: "2-digit",
        })
      ),
      createTextElement(
        "span",
        "in-house-item__month",
        formatNewsDate(item.date, {
          month: "short",
        }).toUpperCase()
      )
    );

    const content =
      document.createElement("div");

    content.className =
      "in-house-item__content";

    const title =
      document.createElement("h4");

    const link =
      document.createElement("a");

    link.href =
      `pages/news-detail.html?id=${
        encodeURIComponent(item.id)
      }`;

    link.textContent = item.title;

    title.append(link);

    content.append(
      title,
      createTextElement(
        "p",
        "in-house-item__excerpt",
        item.excerpt
      )
    );

    article.append(date, content);
    inHouseNewsContainer.append(article);
  });
}

async function renderHomepageNews() {
  latestNewsContainer?.replaceChildren();
  inHouseNewsContainer?.replaceChildren();

  let newsItems;

  try {
    newsItems = window.newsService
      ? await window.newsService.getAllNews()
      : localNewsItems();
  } catch (error) {
    console.warn(
      "News could not be loaded.",
      error
    );

    newsItems = localNewsItems();
  }

  if (!newsItems.length) {
    latestNewsContainer?.append(
      createTextElement(
        "p",
        "news-empty-state",
        "No news has been published yet."
      )
    );

    inHouseNewsContainer?.append(
      createTextElement(
        "p",
        "news-empty-state",
        "Previous news will appear here."
      )
    );

    return;
  }

  renderLatestNews(newsItems[0]);
  renderInHouseNews(newsItems.slice(1, 3));
}

document
  .querySelectorAll(".nav-dropdown")
  .forEach((dropdown) => {
    const trigger =
      dropdown.querySelector(
        ".nav-dropdown__toggle"
      );

    const menu =
      dropdown.querySelector(
        ".nav-dropdown__menu"
      );

    if (!trigger || !menu) return;

    function openDropdown() {
      dropdown.classList.add("open");

      trigger.setAttribute(
        "aria-expanded",
        "true"
      );

      trigger.setAttribute(
        "aria-label",
        "Hide About Us submenu"
      );
    }

    function closeDropdown() {
      dropdown.classList.remove("open");

      trigger.setAttribute(
        "aria-expanded",
        "false"
      );

      trigger.setAttribute(
        "aria-label",
        "Show About Us submenu"
      );
    }

    trigger.addEventListener(
      "click",
      (event) => {
        event.stopPropagation();

        if (dropdown.classList.contains("open")) {
          closeDropdown();
        } else {
          openDropdown();
        }
      }
    );

    dropdown.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          closeDropdown();
          trigger.focus();
        }
      }
    );
  });

document.addEventListener("click", (event) => {
  document
    .querySelectorAll(".nav-dropdown.open")
    .forEach((dropdown) => {
      if (!dropdown.contains(event.target)) {
        dropdown.classList.remove("open");

        dropdown
          .querySelector(
            ".nav-dropdown__toggle"
          )
          ?.setAttribute(
            "aria-expanded",
            "false"
          );
      }
    });
});

document
  .querySelector(".back-to-top")
  ?.addEventListener("click", () => {
    const reduceMotion =
      window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;

    window.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  });