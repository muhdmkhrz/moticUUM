(() => {
  document.addEventListener("DOMContentLoaded", async () => {
    if (!window.newsService) return;

    try {
      const profile = await window.newsService.getPresidentProfile();
      if (!profile) return;

      const name = document.querySelector("[data-president-name]");
      const session = document.querySelector("[data-president-session]");
      const message = document.querySelector("[data-president-message]");
      const portrait = document.querySelector("[data-president-portrait]");

      if (name) name.textContent = profile.name;
      if (session) session.textContent = `President, MOTIC ${profile.sessionLabel}`;
      if (message) message.textContent = profile.message;

      if (portrait && profile.photo) {
        const image = document.createElement("img");
        image.className = "president__portrait-image";
        image.src = profile.photo;
        image.alt = profile.photoAlt || `Portrait of ${profile.name}, President of MOTIC`;
        image.decoding = "async";
        portrait.replaceChildren(image);
      }
    } catch (error) {
      console.warn("The President's profile could not be loaded.", error);
    }
  });
})();
