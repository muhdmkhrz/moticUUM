/* Renders the four homepage highlight columns: Event, Activities,
   Researcher Spotlight and ICTOM. Each column is powered by the
   home_gallery table, filtered by "section". Event and Activities
   always show (with an empty-state message if nothing is published
   yet). Researcher Spotlight and ICTOM stay hidden entirely until
   the admin publishes at least one item. */

(() => {
  const showcase = document.querySelector("[data-home-showcase]");

  if (!showcase) return;

  const AUTO_SLIDE_DELAY = 5000;
  const reducedMotionQuery = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );

  const SECTIONS = [
    { key: "event", alwaysShow: true },
    { key: "activities", alwaysShow: true },
    { key: "researcher_spotlight", alwaysShow: false },
    { key: "ictom", alwaysShow: false },
  ];

  SECTIONS.forEach((section) => initialiseColumn(section));

  async function initialiseColumn({ key, alwaysShow }) {
    const column = showcase.querySelector(
      `[data-gallery-column="${key}"]`
    );

    if (!column) return;

    const carousel = column.querySelector(
      `[data-gallery-carousel="${key}"]`
    );
    const track = column.querySelector("[data-gallery-track]");
    const dotsContainer = column.querySelector("[data-gallery-dots]");
    const previousButton = column.querySelector("[data-gallery-prev]");
    const nextButton = column.querySelector("[data-gallery-next]");
    const emptyState = column.querySelector("[data-gallery-empty]");

    let items = [];

    try {
      items = window.newsService
        ? await window.newsService.getGalleryItems(key)
        : [];
    } catch (error) {
      console.warn(`The ${key} gallery could not be loaded.`, error);
      items = [];
    }

    if (!items.length) {
      if (alwaysShow) {
        column.hidden = false;
        if (carousel) carousel.hidden = true;
        if (emptyState) emptyState.hidden = false;
      } else {
        column.hidden = true;
      }

      return;
    }

    column.hidden = false;
    if (emptyState) emptyState.hidden = true;
    if (carousel) carousel.hidden = false;

    let activeIndex = 0;
    let autoSlideTimer = null;
    let pointerIsInside = false;
    let focusIsInside = false;

    function createSlide(item, index) {
      const hasLink = Boolean(item.link);
      const slide = document.createElement(hasLink ? "a" : "div");

      slide.className = "showcase-slide";
      slide.setAttribute("role", "group");
      slide.setAttribute("aria-roledescription", "slide");
      slide.setAttribute(
        "aria-label",
        `${index + 1} of ${items.length}: ${item.title || "Update"}`
      );

      if (hasLink) {
        slide.href = item.link;
        slide.target = "_blank";
        slide.rel = "noopener";
      }

      const image = document.createElement("img");

      image.className = "showcase-slide__image";
      image.src = item.image;
      image.alt = item.alt || item.title || "";
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";

      slide.append(image);

      if (item.caption || item.title) {
        const caption = document.createElement("span");

        caption.className = "showcase-slide__caption";
        caption.textContent = item.caption || item.title;
        slide.append(caption);
      }

      return slide;
    }

    function createDot(item, index) {
      const dot = document.createElement("button");

      dot.type = "button";
      dot.className = "showcase-dot";
      dot.setAttribute(
        "aria-label",
        `Show ${index + 1} of ${items.length}: ${item.title || "Update"}`
      );

      dot.addEventListener("click", () => {
        showSlide(index);
        restartAutoSlide();
      });

      return dot;
    }

    function showSlide(index) {
      activeIndex = (index + items.length) % items.length;

      if (track) {
        track.style.transform = `translateX(-${activeIndex * 100}%)`;
      }

      if (dotsContainer) {
        [...dotsContainer.children].forEach((dot, dotIndex) => {
          dot.setAttribute(
            "aria-current",
            String(dotIndex === activeIndex)
          );
        });
      }
    }

    function stopAutoSlide() {
      if (autoSlideTimer !== null) {
        window.clearTimeout(autoSlideTimer);
        autoSlideTimer = null;
      }
    }

    function canAutoSlide() {
      return (
        items.length > 1 &&
        !pointerIsInside &&
        !focusIsInside &&
        !document.hidden &&
        !reducedMotionQuery.matches
      );
    }

    function startAutoSlide() {
      stopAutoSlide();

      if (!canAutoSlide()) return;

      autoSlideTimer = window.setTimeout(() => {
        showSlide(activeIndex + 1);
        startAutoSlide();
      }, AUTO_SLIDE_DELAY);
    }

    function restartAutoSlide() {
      stopAutoSlide();
      startAutoSlide();
    }

    items.forEach((item, index) => {
      track?.append(createSlide(item, index));
      dotsContainer?.append(createDot(item, index));
    });

    showSlide(0);

    if (items.length < 2) {
      previousButton?.setAttribute("hidden", "");
      nextButton?.setAttribute("hidden", "");
      if (dotsContainer) dotsContainer.hidden = true;
      return;
    }

    previousButton?.addEventListener("click", () => {
      showSlide(activeIndex - 1);
      restartAutoSlide();
    });

    nextButton?.addEventListener("click", () => {
      showSlide(activeIndex + 1);
      restartAutoSlide();
    });

    column.addEventListener("pointerenter", () => {
      pointerIsInside = true;
      stopAutoSlide();
    });

    column.addEventListener("pointerleave", () => {
      pointerIsInside = false;
      startAutoSlide();
    });

    column.addEventListener("focusin", () => {
      focusIsInside = true;
      stopAutoSlide();
    });

    column.addEventListener("focusout", (event) => {
      if (column.contains(event.relatedTarget)) return;

      focusIsInside = false;
      startAutoSlide();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopAutoSlide();
      } else {
        startAutoSlide();
      }
    });

    reducedMotionQuery.addEventListener?.("change", () => {
      startAutoSlide();
    });

    startAutoSlide();
  }
})();