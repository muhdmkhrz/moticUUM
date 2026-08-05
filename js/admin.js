(() => {
  const service = window.newsService;

  const loginPage =
    document.querySelector("[data-admin-login]");

  const dashboardPage =
    document.querySelector("[data-admin-dashboard]");

  function setStatus(
    element,
    message = "",
    type = "info"
  ) {
    if (!element) return;

    element.textContent = message;
    element.dataset.type = type;
    element.hidden = !message;
  }

  function errorMessage(error) {
    if (error?.code === "23505") {
      return "That news URL slug is already in use.";
    }

    return (
      error?.message ||
      "Something went wrong. Please try again."
    );
  }

  function slugify(value) {
    return value
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120);
  }

  async function initialiseLogin() {
    if (!loginPage) return;

    const form =
      loginPage.querySelector("[data-login-form]");

    const status =
      loginPage.querySelector("[data-login-status]");

    const submitButton =
      form.querySelector("button[type='submit']");

    const passwordInput =
      form.querySelector("#admin-password");

    const passwordToggle =
      form.querySelector("[data-password-toggle]");

    const queryError =
      new URLSearchParams(
        window.location.search
      ).get("error");

    if (!service) {
      setStatus(
        status,
        "The admin service could not load. Check the page scripts.",
        "error"
      );
      return;
    }

    if (queryError === "not-authorized") {
      setStatus(
        status,
        "That account is not authorized for the MOTIC admin portal.",
        "error"
      );
    } else if (queryError === "session-expired") {
      setStatus(
        status,
        "Your session ended. Please sign in again.",
        "error"
      );
    }

    passwordToggle?.addEventListener(
      "click",
      () => {
        const showing =
          passwordInput.type === "text";

        passwordInput.type =
          showing ? "password" : "text";

        passwordToggle.setAttribute(
          "aria-pressed",
          String(!showing)
        );

        passwordToggle.textContent =
          showing ? "Show" : "Hide";
      }
    );

    try {
      const existingUser =
        await service.getCurrentUser();

      if (
        existingUser &&
        await service.isAdmin(existingUser)
      ) {
        window.location.replace(
          "admin-dashboard.html"
        );
        return;
      }

      if (existingUser) {
        await service.signOut();
      }
    } catch (error) {
      console.warn(
        "Existing admin session could not be checked.",
        error
      );
    }

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (!form.reportValidity()) return;

        submitButton.disabled = true;
        submitButton.textContent = "Signing in…";

        setStatus(
          status,
          "Checking your account…",
          "info"
        );

        try {
          const email =
            form.elements.email.value;

          const password =
            form.elements.password.value;

          const user =
            await service.signIn(
              email,
              password
            );

          if (!await service.isAdmin(user)) {
            await service.signOut();

            throw new Error(
              "This account is not authorized to manage MOTIC news."
            );
          }

          window.location.replace(
            "admin-dashboard.html"
          );
        } catch (error) {
          setStatus(
            status,
            errorMessage(error),
            "error"
          );

          submitButton.disabled = false;
          submitButton.textContent = "Sign In";
        }
      }
    );
  }

  async function initialiseDashboard() {
    if (!dashboardPage) return;

    const tabsNav =
      dashboardPage.querySelector(
        "[data-admin-tabs]"
      );

    const tabButtons = tabsNav
      ? [...tabsNav.querySelectorAll(
          "[data-admin-tab]"
        )]
      : [];

    const panels = [
      ...dashboardPage.querySelectorAll(
        "[data-admin-panel]"
      ),
    ];

    function showTab(key) {
      panels.forEach((panel) => {
        panel.hidden =
          panel.dataset.adminPanel !== key;
      });

      tabButtons.forEach((tabButton) => {
        const isActive =
          tabButton.dataset.adminTab === key;

        tabButton.classList.toggle(
          "active",
          isActive
        );

        tabButton.setAttribute(
          "aria-selected",
          String(isActive)
        );

        tabButton.tabIndex =
          isActive ? 0 : -1;
      });
    }

    tabButtons.forEach((tabButton) => {
      tabButton.addEventListener(
        "click",
        () => {
          showTab(
            tabButton.dataset.adminTab
          );
        }
      );

      tabButton.addEventListener(
        "keydown",
        (event) => {
          const currentIndex =
            tabButtons.indexOf(tabButton);

          let nextIndex = null;

          if (
            event.key === "ArrowRight" ||
            event.key === "ArrowDown"
          ) {
            nextIndex =
              (currentIndex + 1) %
              tabButtons.length;
          } else if (
            event.key === "ArrowLeft" ||
            event.key === "ArrowUp"
          ) {
            nextIndex =
              (
                currentIndex -
                1 +
                tabButtons.length
              ) % tabButtons.length;
          } else if (event.key === "Home") {
            nextIndex = 0;
          } else if (event.key === "End") {
            nextIndex =
              tabButtons.length - 1;
          }

          if (nextIndex === null) return;

          event.preventDefault();

          const nextTab =
            tabButtons[nextIndex];

          showTab(
            nextTab.dataset.adminTab
          );

          nextTab.focus();
        }
      );
    });

    const status =
      dashboardPage.querySelector(
        "[data-dashboard-status]"
      );

    const form =
      dashboardPage.querySelector(
        "[data-news-form]"
      );

    const formTitle =
      dashboardPage.querySelector(
        "[data-form-title]"
      );

    const saveButton =
      form.querySelector(
        "button[type='submit']"
      );

    const cancelButton =
      form.querySelector(
        "[data-cancel-edit]"
      );

    const newStoryButton =
      dashboardPage.querySelector(
        "[data-new-story]"
      );

    const logoutButton =
      dashboardPage.querySelector(
        "[data-admin-logout]"
      );

    const list =
      dashboardPage.querySelector(
        "[data-admin-news-list]"
      );

    const emptyState =
      dashboardPage.querySelector(
        "[data-admin-empty]"
      );

    const accountEmail =
      dashboardPage.querySelector(
        "[data-admin-email]"
      );

    const currentImage =
      dashboardPage.querySelector(
        "[data-current-image]"
      );

    const titleInput =
      form.elements.title;

    const slugInput =
      form.elements.slug;

    const posterForm =
      dashboardPage.querySelector(
        "[data-poster-form]"
      );

    const posterFormTitle =
      dashboardPage.querySelector(
        "[data-poster-form-title]"
      );

    const posterSaveButton =
      posterForm.querySelector(
        "button[type='submit']"
      );

    const posterCancelButton =
      posterForm.querySelector(
        "[data-cancel-poster-edit]"
      );

    const posterList =
      dashboardPage.querySelector(
        "[data-admin-poster-list]"
      );

    const posterEmptyState =
      dashboardPage.querySelector(
        "[data-admin-poster-empty]"
      );

    const posterCurrentImage =
      dashboardPage.querySelector(
        "[data-poster-current-image]"
      );

    let stories = [];
    let editingStory = null;
    let slugWasEdited = false;
    let posters = [];
    let editingPoster = null;

    if (!service) {
      setStatus(
        status,
        "The admin service could not load. Check the page scripts.",
        "error"
      );
      return;
    }

    function formatDate(date) {
      return new Intl.DateTimeFormat(
        "en-MY",
        {
          day: "numeric",
          month: "long",
          year: "numeric",
        }
      ).format(
        new Date(`${date}T12:00:00`)
      );
    }

    function resetForm(scroll = false) {
      form.reset();
      editingStory = null;
      slugWasEdited = false;

      form.elements.date.value =
        new Date()
          .toISOString()
          .slice(0, 10);

      form.elements.category.value =
        "Club News";

      formTitle.textContent =
        "Publish a new story";

      saveButton.textContent =
        "Publish News";

      cancelButton.hidden = true;

      currentImage.textContent =
        "No image selected.";

      setStatus(status);

      if (scroll) {
        form.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }

    function fillForm(story) {
      editingStory = story;
      slugWasEdited = true;

      form.elements.title.value =
        story.title;

      form.elements.slug.value =
        story.id;

      form.elements.date.value =
        story.date;

      form.elements.category.value =
        story.category || "Club News";

      form.elements.excerpt.value =
        story.excerpt;

      form.elements.content.value =
        (story.content || []).join("\n\n");

      form.elements.imageAlt.value =
        story.imageAlt || "";

      form.elements.image.value = "";

      formTitle.textContent =
        "Edit news story";

      saveButton.textContent =
        "Save Changes";

      cancelButton.hidden = false;

      currentImage.textContent =
        story.image
          ? "A current image is attached. Choose a new file only if you want to replace it."
          : "This story has no image.";

      setStatus(status);

      form.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      titleInput.focus({
        preventScroll: true,
      });
    }

    function renderStories() {
      list.replaceChildren();

      emptyState.hidden =
        stories.length > 0;

      stories.forEach((story) => {
        const row =
          document.createElement("article");

        row.className =
          "admin-news-row";

        const information =
          document.createElement("div");

        information.className =
          "admin-news-row__content";

        const title =
          document.createElement("h3");

        title.textContent = story.title;

        const meta =
          document.createElement("p");

        meta.textContent =
          `${story.category || "News"} · ${
            formatDate(story.date)
          }`;

        information.append(
          title,
          meta
        );

        const actions =
          document.createElement("div");

        actions.className =
          "admin-news-row__actions";

        const viewLink =
          document.createElement("a");

        viewLink.className =
          "admin-text-button";

        viewLink.href =
          `news-detail.html?id=${
            encodeURIComponent(story.id)
          }`;

        viewLink.target = "_blank";
        viewLink.rel = "noopener";
        viewLink.textContent = "View";

        const editButton =
          document.createElement("button");

        editButton.className =
          "admin-text-button";

        editButton.type = "button";
        editButton.textContent = "Edit";

        editButton.addEventListener(
          "click",
          () => fillForm(story)
        );

        const deleteButton =
          document.createElement("button");

        deleteButton.className =
          "admin-text-button admin-text-button--danger";

        deleteButton.type = "button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener(
          "click",
          async () => {
            const confirmed =
              window.confirm(
                `Delete “${story.title}”? This cannot be undone.`
              );

            if (!confirmed) return;

            deleteButton.disabled = true;

            setStatus(
              status,
              "Deleting story…",
              "info"
            );

            try {
              await service.deleteNews(
                story.databaseId
              );

              if (story.imagePath) {
                try {
                  await service.removeNewsImage(
                    story.imagePath
                  );
                } catch (imageError) {
                  console.warn(
                    "The story was deleted, but its image could not be removed.",
                    imageError
                  );
                }
              }

              if (
                editingStory?.databaseId ===
                story.databaseId
              ) {
                resetForm();
              }

              await loadStories();

              setStatus(
                status,
                "News story deleted.",
                "success"
              );
            } catch (error) {
              setStatus(
                status,
                errorMessage(error),
                "error"
              );

              deleteButton.disabled = false;
            }
          }
        );

        actions.append(
          viewLink,
          editButton,
          deleteButton
        );

        row.append(
          information,
          actions
        );

        list.append(row);
      });
    }

    async function loadStories() {
      stories =
        await service.getAllNews({
          allowFallback: false,
        });

      renderStories();
    }

    function resolvePosterImage(source) {
      if (
        /^(?:https?:)?\/\//i.test(source) ||
        source.startsWith("data:") ||
        source.startsWith("/")
      ) {
        return source;
      }

      return `../${source}`;
    }

    function resetPosterForm(
      scroll = false
    ) {
      posterForm.reset();
      editingPoster = null;

      posterForm.elements.posterOrder.value =
        "0";

      posterForm.elements.posterActive.checked =
        true;

      posterFormTitle.textContent =
        "Add a poster";

      posterSaveButton.textContent =
        "Add Poster";

      posterCancelButton.hidden = true;

      posterCurrentImage.textContent =
        "A poster image is required.";

      if (scroll) {
        posterForm.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }

    function fillPosterForm(poster) {
      editingPoster = poster;

      posterForm.elements.posterTitle.value =
        poster.title;

      posterForm.elements.posterAlt.value =
        poster.alt;

      posterForm.elements.posterLink.value =
        poster.link || "";

      posterForm.elements.posterOrder.value =
        poster.displayOrder;

      posterForm.elements.posterActive.checked =
        poster.isActive;

      posterForm.elements.posterImage.value =
        "";

      posterFormTitle.textContent =
        "Edit poster";

      posterSaveButton.textContent =
        "Save Poster";

      posterCancelButton.hidden = false;

      posterCurrentImage.textContent =
        "A current image is attached. Choose a file only to replace it.";

      setStatus(status);

      posterForm.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      posterForm.elements.posterTitle.focus({
        preventScroll: true,
      });
    }

    function renderPosters() {
      posterList.replaceChildren();

      posterEmptyState.hidden =
        posters.length > 0;

      posters.forEach((poster) => {
        const row =
          document.createElement("article");

        row.className =
          "admin-poster-row";

        const image =
          document.createElement("img");

        image.src =
          resolvePosterImage(poster.image);

        image.alt = "";
        image.loading = "lazy";

        const information =
          document.createElement("div");

        information.className =
          "admin-poster-row__content";

        const title =
          document.createElement("h4");

        title.textContent = poster.title;

        const meta =
          document.createElement("p");

        meta.textContent =
          `Order ${poster.displayOrder} · ${
            poster.isActive
              ? "Visible"
              : "Hidden"
          }`;

        information.append(
          title,
          meta
        );

        const actions =
          document.createElement("div");

        actions.className =
          "admin-news-row__actions";

        const editButton =
          document.createElement("button");

        editButton.className =
          "admin-text-button";

        editButton.type = "button";
        editButton.textContent = "Edit";

        editButton.addEventListener(
          "click",
          () => fillPosterForm(poster)
        );

        const deleteButton =
          document.createElement("button");

        deleteButton.className =
          "admin-text-button admin-text-button--danger";

        deleteButton.type = "button";
        deleteButton.textContent = "Delete";

        deleteButton.addEventListener(
          "click",
          async () => {
            const confirmed =
              window.confirm(
                `Delete poster “${poster.title}”?`
              );

            if (!confirmed) return;

            deleteButton.disabled = true;

            setStatus(
              status,
              "Deleting poster…",
              "info"
            );

            try {
              await service.deletePoster(
                poster.databaseId
              );

              if (poster.imagePath) {
                try {
                  await service.removeNewsImage(
                    poster.imagePath
                  );
                } catch (imageError) {
                  console.warn(
                    "The poster was deleted, but its image could not be removed.",
                    imageError
                  );
                }
              }

              if (
                editingPoster?.databaseId ===
                poster.databaseId
              ) {
                resetPosterForm();
              }

              await loadPosters();

              setStatus(
                status,
                "Poster deleted.",
                "success"
              );
            } catch (error) {
              setStatus(
                status,
                errorMessage(error),
                "error"
              );

              deleteButton.disabled = false;
            }
          }
        );

        actions.append(
          editButton,
          deleteButton
        );

        row.append(
          image,
          information,
          actions
        );

        posterList.append(row);
      });
    }

    async function loadPosters() {
      posters =
        await service.getAllPosters({
          allowFallback: false,
        });

      renderPosters();
    }

    posterCancelButton.addEventListener(
      "click",
      () => {
        resetPosterForm(true);
      }
    );

    const GALLERY_SECTIONS = [
      {
        key: "event",
        nounSingular: "event poster",
        verbAdd: "Add Event Poster",
      },
      {
        key: "activities",
        nounSingular: "activity photo",
        verbAdd: "Add Activity Photo",
      },
      {
        key: "researcher_spotlight",
        nounSingular: "spotlight",
        verbAdd: "Add Spotlight",
      },
      {
        key: "ictom",
        nounSingular: "ICTOM item",
        verbAdd: "Add ICTOM Item",
      },
    ];

    function resolveGalleryImage(source) {
      if (
        /^(?:https?:)?\/\//i.test(source) ||
        source.startsWith("data:") ||
        source.startsWith("/")
      ) {
        return source;
      }

      return `../${source}`;
    }

    function setupGalleryPanel({
      key,
      nounSingular,
      verbAdd,
    }) {
      const panel =
        dashboardPage.querySelector(
          `[data-gallery-panel="${key}"]`
        );

      if (!panel) {
        return {
          load: async () => {},
        };
      }

      const form =
        panel.querySelector(
          `[data-gallery-form="${key}"]`
        );

      const formTitle =
        panel.querySelector(
          "[data-gallery-form-title]"
        );

      const saveButton =
        form.querySelector(
          "button[type='submit']"
        );

      const cancelButton =
        form.querySelector(
          "[data-gallery-cancel]"
        );

      const list =
        panel.querySelector(
          `[data-gallery-list="${key}"]`
        );

      const emptyState =
        panel.querySelector(
          "[data-gallery-empty]"
        );

      const currentImage =
        panel.querySelector(
          "[data-gallery-current-image]"
        );

      let items = [];
      let editingItem = null;

      function resetForm(scroll = false) {
        form.reset();
        editingItem = null;

        form.elements.galleryOrder.value =
          "0";

        form.elements.galleryActive.checked =
          true;

        const article =
          /^[aeiou]/i.test(nounSingular)
            ? "an"
            : "a";

        formTitle.textContent =
          `Add ${article} ${nounSingular}`;

        saveButton.textContent = verbAdd;
        cancelButton.hidden = true;

        currentImage.textContent =
          "An image is required.";

        if (scroll) {
          form.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      }

      function fillForm(item) {
        editingItem = item;

        form.elements.galleryTitle.value =
          item.title;

        form.elements.galleryAlt.value =
          item.alt;

        form.elements.galleryCaption.value =
          item.caption || "";

        form.elements.galleryLink.value =
          item.link || "";

        form.elements.galleryOrder.value =
          item.displayOrder;

        form.elements.galleryActive.checked =
          item.isActive;

        form.elements.galleryImage.value =
          "";

        formTitle.textContent =
          `Edit ${nounSingular}`;

        saveButton.textContent =
          "Save Changes";

        cancelButton.hidden = false;

        currentImage.textContent =
          "A current image is attached. Choose a file only to replace it.";

        form.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });

        form.elements.galleryTitle.focus({
          preventScroll: true,
        });
      }

      function renderItems() {
        list.replaceChildren();

        emptyState.hidden =
          items.length > 0;

        items.forEach((item) => {
          const row =
            document.createElement("article");

          row.className =
            "admin-poster-row";

          const image =
            document.createElement("img");

          image.src =
            resolveGalleryImage(
              item.image
            );

          image.alt = "";
          image.loading = "lazy";

          const information =
            document.createElement("div");

          information.className =
            "admin-poster-row__content";

          const title =
            document.createElement("h4");

          title.textContent = item.title;

          const meta =
            document.createElement("p");

          meta.textContent =
            `Order ${item.displayOrder} · ${
              item.isActive
                ? "Visible"
                : "Hidden"
            }`;

          information.append(
            title,
            meta
          );

          const actions =
            document.createElement("div");

          actions.className =
            "admin-news-row__actions";

          const editButton =
            document.createElement("button");

          editButton.className =
            "admin-text-button";

          editButton.type = "button";
          editButton.textContent = "Edit";

          editButton.addEventListener(
            "click",
            () => fillForm(item)
          );

          const deleteButton =
            document.createElement("button");

          deleteButton.className =
            "admin-text-button admin-text-button--danger";

          deleteButton.type = "button";
          deleteButton.textContent =
            "Delete";

          deleteButton.addEventListener(
            "click",
            async () => {
              const confirmed =
                window.confirm(
                  `Delete “${item.title}”?`
                );

              if (!confirmed) return;

              deleteButton.disabled = true;

              setStatus(
                status,
                `Deleting ${nounSingular}…`,
                "info"
              );

              try {
                await service.deleteGalleryItem(
                  item.databaseId
                );

                if (item.imagePath) {
                  try {
                    await service.removeNewsImage(
                      item.imagePath
                    );
                  } catch (imageError) {
                    console.warn(
                      `The ${nounSingular} was deleted, but its image could not be removed.`,
                      imageError
                    );
                  }
                }

                if (
                  editingItem?.databaseId ===
                  item.databaseId
                ) {
                  resetForm();
                }

                await loadItems();

                setStatus(
                  status,
                  `${nounSingular} deleted.`,
                  "success"
                );
              } catch (error) {
                setStatus(
                  status,
                  errorMessage(error),
                  "error"
                );

                deleteButton.disabled = false;
              }
            }
          );

          actions.append(
            editButton,
            deleteButton
          );

          row.append(
            image,
            information,
            actions
          );

          list.append(row);
        });
      }

      async function loadItems() {
        items =
          await service.getGalleryItemsForAdmin(
            key
          );

        renderItems();
      }

      cancelButton.addEventListener(
        "click",
        () => resetForm(true)
      );

      form.addEventListener(
        "submit",
        async (event) => {
          event.preventDefault();

          if (!form.reportValidity()) return;

          const selectedImage =
            form.elements.galleryImage
              .files[0];

          if (
            !selectedImage &&
            !editingItem
          ) {
            setStatus(
              status,
              "Choose an image before saving.",
              "error"
            );

            form.elements.galleryImage.focus();
            return;
          }

          saveButton.disabled = true;
          cancelButton.disabled = true;

          const wasEditing =
            Boolean(editingItem);

          saveButton.textContent =
            wasEditing
              ? "Saving…"
              : "Adding…";

          setStatus(
            status,
            wasEditing
              ? `Saving ${nounSingular}…`
              : `Adding ${nounSingular}…`,
            "info"
          );

          let newUpload = null;

          try {
            if (selectedImage) {
              newUpload =
                await service.uploadGalleryImage(
                  selectedImage,
                  key
                );
            }

            const item = {
              section: key,

              title:
                form.elements.galleryTitle
                  .value,

              image:
                newUpload?.image ||
                editingItem?.image ||
                "",

              imagePath:
                newUpload?.imagePath ||
                editingItem?.imagePath ||
                "",

              alt:
                form.elements.galleryAlt
                  .value,

              caption:
                form.elements.galleryCaption
                  .value,

              link:
                form.elements.galleryLink
                  .value,

              displayOrder:
                form.elements.galleryOrder
                  .value,

              isActive:
                form.elements.galleryActive
                  .checked,
            };

            if (editingItem) {
              await service.updateGalleryItem(
                editingItem.databaseId,
                item
              );

              if (
                newUpload &&
                editingItem.imagePath
              ) {
                try {
                  await service.removeNewsImage(
                    editingItem.imagePath
                  );
                } catch (imageError) {
                  console.warn(
                    `The old ${nounSingular} image could not be removed.`,
                    imageError
                  );
                }
              }
            } else {
              await service.createGalleryItem(
                item
              );
            }

            resetForm();
            await loadItems();

            setStatus(
              status,
              wasEditing
                ? "Changes saved."
                : `${nounSingular} added.`,
              "success"
            );
          } catch (error) {
            if (newUpload?.imagePath) {
              try {
                await service.removeNewsImage(
                  newUpload.imagePath
                );
              } catch (cleanupError) {
                console.warn(
                  "An unused upload could not be removed.",
                  cleanupError
                );
              }
            }

            setStatus(
              status,
              errorMessage(error),
              "error"
            );
          } finally {
            saveButton.disabled = false;
            cancelButton.disabled = false;

            saveButton.textContent =
              editingItem
                ? "Save Changes"
                : verbAdd;
          }
        }
      );

      resetForm();

      return {
        load: loadItems,
      };
    }

    const galleryPanels =
      GALLERY_SECTIONS.map(
        setupGalleryPanel
      );

    posterForm.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (!posterForm.reportValidity()) {
          return;
        }

        const selectedImage =
          posterForm.elements.posterImage
            .files[0];

        if (
          !selectedImage &&
          !editingPoster
        ) {
          setStatus(
            status,
            "Choose a poster image before saving.",
            "error"
          );

          posterForm.elements.posterImage.focus();
          return;
        }

        posterSaveButton.disabled = true;
        posterCancelButton.disabled = true;

        const wasEditing =
          Boolean(editingPoster);

        posterSaveButton.textContent =
          wasEditing
            ? "Saving…"
            : "Adding…";

        setStatus(
          status,
          wasEditing
            ? "Saving poster…"
            : "Adding poster…",
          "info"
        );

        let newUpload = null;

        try {
          if (selectedImage) {
            newUpload =
              await service.uploadPosterImage(
                selectedImage
              );
          }

          const poster = {
            title:
              posterForm.elements.posterTitle
                .value,

            image:
              newUpload?.image ||
              editingPoster?.image ||
              "",

            imagePath:
              newUpload?.imagePath ||
              editingPoster?.imagePath ||
              "",

            alt:
              posterForm.elements.posterAlt
                .value,

            link:
              posterForm.elements.posterLink
                .value,

            displayOrder:
              posterForm.elements.posterOrder
                .value,

            isActive:
              posterForm.elements.posterActive
                .checked,
          };

          if (editingPoster) {
            await service.updatePoster(
              editingPoster.databaseId,
              poster
            );

            if (
              newUpload &&
              editingPoster.imagePath
            ) {
              try {
                await service.removeNewsImage(
                  editingPoster.imagePath
                );
              } catch (imageError) {
                console.warn(
                  "The old poster image could not be removed.",
                  imageError
                );
              }
            }
          } else {
            await service.createPoster(
              poster
            );
          }

          resetPosterForm();
          await loadPosters();

          setStatus(
            status,
            wasEditing
              ? "Poster updated."
              : "Poster added to the slider.",
            "success"
          );
        } catch (error) {
          if (newUpload?.imagePath) {
            try {
              await service.removeNewsImage(
                newUpload.imagePath
              );
            } catch (cleanupError) {
              console.warn(
                "An unused poster upload could not be removed.",
                cleanupError
              );
            }
          }

          setStatus(
            status,
            errorMessage(error),
            "error"
          );
        } finally {
          posterSaveButton.disabled = false;
          posterCancelButton.disabled = false;

          posterSaveButton.textContent =
            editingPoster
              ? "Save Poster"
              : "Add Poster";
        }
      }
    );

    titleInput.addEventListener(
      "input",
      () => {
        if (!slugWasEdited) {
          slugInput.value =
            slugify(titleInput.value);
        }
      }
    );

    slugInput.addEventListener(
      "input",
      () => {
        slugWasEdited = true;

        slugInput.value =
          slugify(slugInput.value);
      }
    );

    cancelButton.addEventListener(
      "click",
      () => {
        resetForm(true);
      }
    );

    newStoryButton.addEventListener(
      "click",
      () => {
        resetForm(true);
      }
    );

    logoutButton.addEventListener(
      "click",
      async () => {
        logoutButton.disabled = true;

        try {
          await service.signOut();
        } finally {
          window.location.replace(
            "admin.html"
          );
        }
      }
    );

    form.addEventListener(
      "submit",
      async (event) => {
        event.preventDefault();

        if (!form.reportValidity()) return;

        saveButton.disabled = true;
        cancelButton.disabled = true;

        const wasEditing =
          Boolean(editingStory);

        saveButton.textContent =
          wasEditing
            ? "Saving…"
            : "Publishing…";

        setStatus(
          status,
          wasEditing
            ? "Saving changes…"
            : "Publishing story…",
          "info"
        );

        const selectedImage =
          form.elements.image.files[0];

        let newUpload = null;

        try {
          if (selectedImage) {
            newUpload =
              await service.uploadNewsImage(
                selectedImage
              );
          }

          const story = {
            slug: slugInput.value,
            title: titleInput.value,

            date:
              form.elements.date.value,

            category:
              form.elements.category.value,

            excerpt:
              form.elements.excerpt.value,

            content:
              form.elements.content.value
                .split(/\n\s*\n/)
                .map(
                  (paragraph) =>
                    paragraph.trim()
                )
                .filter(Boolean),

            image:
              newUpload?.image ||
              editingStory?.image ||
              "",

            imagePath:
              newUpload?.imagePath ||
              editingStory?.imagePath ||
              "",

            imageAlt:
              form.elements.imageAlt.value,
          };

          if (editingStory) {
            await service.updateNews(
              editingStory.databaseId,
              story
            );

            if (
              newUpload &&
              editingStory.imagePath
            ) {
              try {
                await service.removeNewsImage(
                  editingStory.imagePath
                );
              } catch (imageError) {
                console.warn(
                  "The old image could not be removed.",
                  imageError
                );
              }
            }
          } else {
            await service.createNews(
              story
            );
          }

          resetForm();
          await loadStories();

          setStatus(
            status,
            wasEditing
              ? "Changes saved."
              : "News story published.",
            "success"
          );
        } catch (error) {
          if (newUpload?.imagePath) {
            try {
              await service.removeNewsImage(
                newUpload.imagePath
              );
            } catch (cleanupError) {
              console.warn(
                "An unused upload could not be removed.",
                cleanupError
              );
            }
          }

          setStatus(
            status,
            errorMessage(error),
            "error"
          );
        } finally {
          saveButton.disabled = false;
          cancelButton.disabled = false;

          saveButton.textContent =
            editingStory
              ? "Save Changes"
              : "Publish News";
        }
      }
    );

    try {
      const user =
        await service.getCurrentUser();

      if (!user) {
        window.location.replace(
          "admin.html?error=session-expired"
        );
        return;
      }

      if (!await service.isAdmin(user)) {
        await service.signOut();

        window.location.replace(
          "admin.html?error=not-authorized"
        );
        return;
      }

      accountEmail.textContent =
        user.email ||
        "Authorized administrator";

      resetForm();
      resetPosterForm();

      await Promise.all([
        loadStories(),
        loadPosters(),
        ...galleryPanels.map(
          (panel) => panel.load()
        ),
      ]);
    } catch (error) {
      setStatus(
        status,
        errorMessage(error),
        "error"
      );
    }
  }

  initialiseLogin();
  initialiseDashboard();
})();