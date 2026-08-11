(() => {
  const directory = document.querySelector(
    "[data-contact-directory]"
  );

  const service = window.newsService;

  if (!directory || !service) return;

  function resolvePhoto(source) {
    if (!source) {
      return "../assets/images/contact-portrait-placeholder.svg";
    }

    if (
      /^(?:https?:)?\/\//i.test(source) ||
      source.startsWith("data:") ||
      source.startsWith("/")
    ) {
      return source;
    }

    return `../${source}`;
  }

  function updateCard(contact) {
    const card = directory.querySelector(
      `[data-contact-id="${contact.id}"]`
    );

    if (!card) return;

    const photo = card.querySelector(
      "[data-contact-photo]"
    );

    const role = card.querySelector(
      "[data-contact-role]"
    );

    const kicker = card.querySelector(
      "[data-contact-kicker]"
    );

    const name = card.querySelector(
      "[data-contact-name]"
    );

    const emailRow = card.querySelector(
      "[data-contact-email-row]"
    );

    const email = card.querySelector(
      "[data-contact-email]"
    );

    const phoneRow = card.querySelector(
      "[data-contact-phone-row]"
    );

    const phone = card.querySelector(
      "[data-contact-phone]"
    );

    if (photo) {
      photo.src = resolvePhoto(contact.photo);
      photo.alt = contact.photoAlt ||
        `Portrait of ${contact.name}`;
    }

    if (role) role.textContent = contact.roleLabel;
    if (kicker) kicker.textContent = contact.kicker;
    if (name) name.textContent = contact.name;

    if (emailRow && email) {
      const hasEmail = Boolean(contact.email);

      emailRow.hidden = !hasEmail;
      email.textContent = contact.email || "";
      email.href = hasEmail
        ? `mailto:${contact.email}`
        : "#";
    }

    if (phoneRow && phone) {
      const hasPhone = Boolean(contact.phone);
      const dialNumber = (contact.phone || "")
        .replace(/[^\d+]/g, "")
        .replace(/(?!^)\+/g, "");

      phoneRow.hidden = !hasPhone;
      phone.textContent = contact.phone || "";
      phone.href = hasPhone
        ? `tel:${dialNumber}`
        : "#";
    }
  }

  async function renderContacts() {
    try {
      const contacts = await service.getContactPeople();
      contacts.forEach(updateCard);
    } catch (error) {
      console.warn(
        "Live contact details could not be loaded. The page fallback remains visible.",
        error
      );
    }
  }

  renderContacts();
})();
