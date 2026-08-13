(() => {
  const sentenceCaseSelector = [
    "h1",
    "h2",
    "h3",
    "h4",
    ".page-hero__lede",
    ".section-heading > p",
    ".admin-dashboard-header p",
    ".admin-panel__heading > p",
    "[data-sentence-case]",
  ].join(",");

  const sentenceCaseInputSelector = [
    'input[name="title"]',
    'input[name$="Title"]',
    'input[name$="Subtitle"]',
    'textarea[name="excerpt"]',
    'textarea[name$="Caption"]',
  ].join(",");

  function uppercaseFirstLetter(value) {
    return String(value || "").replace(
      /^(\s*[\"'“‘([{]*)([a-z])/,
      (_, prefix, letter) => `${prefix}${letter.toUpperCase()}`
    );
  }

  function sentenceCaseElement(element) {
    if (!(element instanceof HTMLElement)) return;

    for (const node of element.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !/[a-z]/i.test(node.textContent || "")) {
        continue;
      }

      node.textContent = uppercaseFirstLetter(node.textContent);
      break;
    }
  }

  function sentenceCaseWithin(root = document) {
    if (root instanceof Element && root.matches(sentenceCaseSelector)) {
      sentenceCaseElement(root);
    }

    root.querySelectorAll?.(sentenceCaseSelector).forEach(sentenceCaseElement);
  }

  document.querySelectorAll("#current-year, [data-current-year]").forEach((year) => {
    year.textContent = new Date().getFullYear();
  });

  sentenceCaseWithin(document);

  document.addEventListener(
    "blur",
    (event) => {
      const field = event.target;

      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return;
      }

      if (field.matches(sentenceCaseInputSelector)) {
        field.value = uppercaseFirstLetter(field.value);
      }
    },
    true
  );

  const observer = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof Element) sentenceCaseWithin(node);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
