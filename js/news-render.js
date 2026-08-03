/* global newsData */

(() => {
  const newsDateFormatter =
    new Intl.DateTimeFormat("en-MY", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  function formatArchiveDate(date) {
    return newsDateFormatter.format(
      new Date(`${date}T12:00:00`)
    );
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

  function resolveNewsImage(source) {
    if (!source) return "";

    if (
      /^(?:https?:)?\/\//i.test(source) ||
      source.startsWith("data:") ||
      source.startsWith("/")
    ) {
      return source;
    }

    return `${document.body.dataset.assetBase || ""}${source}`;
  }

  function showNewsNotFound(container) {
    const notFound =
      document.createElement("div");

    notFound.className = "news-not-found";

    const heading =
      document.createElement("h1");

    heading.textContent =
      "News story not found";

    const message =
      document.createElement("p");

    message.textContent =
      "This story may have been moved or removed.";

    const link =
      document.createElement("a");

    link.className = "news-detail__back";
    link.href = "news.html";
    link.textContent = "← Return to All News";

    notFound.append(
      heading,
      message,
      link
    );

    container.replaceChildren(notFound);
  }

  async function loadAllNews() {
    try {
      return window.newsService
        ? await window.newsService.getAllNews()
        : localNewsItems();
    } catch (error) {
      console.warn(
        "Live news could not be loaded.",
        error
      );

      return localNewsItems();
    }
  }

  async function renderNewsArchive() {
    const list =
      document.querySelector("[data-news-list]");

    const count =
      document.querySelector("[data-news-count]");

    if (!list) return;

    const items = await loadAllNews();

    list.replaceChildren();

    if (count) {
      count.textContent =
        `${items.length} ${items.length === 1 ? "story" : "stories"}`;
    }

    if (!items.length) {
      const emptyState =
        document.createElement("p");

      emptyState.className =
        "news-empty-state";

      emptyState.textContent =
        "No news has been published yet.";

      list.append(emptyState);
      return;
    }

    items.forEach((item) => {
      const row =
        document.createElement("article");

      row.className = "news-table__row";

      const titleLink =
        document.createElement("a");

      titleLink.className =
        "news-table__title";

      titleLink.href =
        `news-detail.html?id=${encodeURIComponent(item.id)}`;

      titleLink.textContent = item.title;

      const date =
        document.createElement("time");

      date.className = "news-table__date";
      date.dateTime = item.date;
      date.textContent =
        formatArchiveDate(item.date);

      row.append(titleLink, date);
      list.append(row);
    });
  }

  async function renderNewsDetail() {
    const container =
      document.querySelector(
        "[data-news-detail]"
      );

    if (!container) return;

    const slug =
      new URLSearchParams(
        window.location.search
      ).get("id");

    let item = null;

    try {
      item = window.newsService
        ? await window.newsService.getNewsBySlug(
            slug
          )
        : localNewsItems().find(
            (newsItem) =>
              newsItem.id === slug
          ) || null;
    } catch (error) {
      console.warn(
        "The news story could not be loaded.",
        error
      );

      item =
        localNewsItems().find(
          (newsItem) =>
            newsItem.id === slug
        ) || null;
    }

    if (!item) {
      showNewsNotFound(container);
      return;
    }

    document.title =
      `${item.title} | MOTIC`;

    const article =
      document.createElement("article");

    article.className =
      "news-detail__article";

    const backLink =
      document.createElement("a");

    backLink.className =
      "news-detail__back";

    backLink.href = "news.html";
    backLink.textContent = "← All News";

    const category =
      document.createElement("p");

    category.className = "eyebrow";
    category.textContent =
      item.category || "News";

    const title =
      document.createElement("h1");

    title.textContent = item.title;

    const meta =
      document.createElement("p");

    meta.className =
      "news-detail__meta";

    meta.textContent =
      `Published ${formatArchiveDate(item.date)} · MOTIC UUM`;

    article.append(
      backLink,
      category,
      title,
      meta
    );

    if (item.image) {
      const image =
        document.createElement("img");

      image.className =
        "news-detail__image";

      image.src =
        resolveNewsImage(item.image);

      image.alt =
        item.imageAlt || item.title;

      article.append(image);
    }

    const body =
      document.createElement("div");

    body.className =
      "news-detail__body";

    const paragraphs =
      Array.isArray(item.content) &&
      item.content.length
        ? item.content
        : [item.excerpt];

    paragraphs.forEach(
      (paragraphText) => {
        const paragraph =
          document.createElement("p");

        paragraph.textContent =
          paragraphText;

        body.append(paragraph);
      }
    );

    article.append(body);
    container.replaceChildren(article);
  }

  renderNewsArchive();
  renderNewsDetail();
})();