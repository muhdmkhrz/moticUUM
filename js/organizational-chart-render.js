(() => {
  document.addEventListener("DOMContentLoaded", async () => {
    const frame = document.querySelector("[data-organizational-chart]");
    if (!frame || !window.newsService) return;

    try {
      const chart = await window.newsService.getOrganizationalChart();
      if (!chart?.image) return;

      const heading = document.querySelector("[data-chart-heading]");
      const session = document.querySelector("[data-chart-session]");
      const image = document.createElement("img");

      image.className = "organizational-chart__image";
      image.src = chart.image;
      image.alt = chart.alt || chart.title;
      image.decoding = "async";

      if (heading) heading.textContent = chart.title;
      if (session) session.textContent = `MOTIC ${chart.sessionLabel}`;
      frame.classList.add("organizational-chart__frame");
      frame.replaceChildren(image);
    } catch (error) {
      console.warn("The organizational chart could not be loaded.", error);
    }
  });
})();
