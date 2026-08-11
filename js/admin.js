(() => {
  const service = window.newsService;

  const loginPage =
    document.querySelector("[data-admin-login]");

  const dashboardPage =
    document.querySelector("[data-admin-dashboard]");

  const statusTimers = new WeakMap();

  const ADMIN_ACTIVITY_STORAGE_KEY =
    "motic-admin-last-activity";

  const ADMIN_INACTIVITY_LIMIT =
    15 * 60 * 1000;

  function getAdminLastActivity() {
    const storedActivity = Number(
      window.localStorage.getItem(
        ADMIN_ACTIVITY_STORAGE_KEY
      )
    );

    return Number.isFinite(storedActivity) &&
      storedActivity > 0
      ? storedActivity
      : null;
  }

  function hasRecentAdminActivity(
    now = Date.now()
  ) {
    const lastActivity =
      getAdminLastActivity();

    if (!lastActivity) return false;

    const elapsed = now - lastActivity;

    return elapsed >= 0 &&
      elapsed < ADMIN_INACTIVITY_LIMIT;
  }

  function rememberAdminActivity(
    activityTime = Date.now()
  ) {
    window.localStorage.setItem(
      ADMIN_ACTIVITY_STORAGE_KEY,
      String(activityTime)
    );
  }

  function forgetAdminActivity() {
    window.localStorage.removeItem(
      ADMIN_ACTIVITY_STORAGE_KEY
    );
  }

  function setStatus(
    element,
    message = "",
    type = "info"
  ) {
    if (!element) return;

    element.textContent = message;
    element.dataset.type = type;
    element.hidden = !message;

    const previousTimer = statusTimers.get(element);
    if (previousTimer) window.clearTimeout(previousTimer);

    element.classList.toggle(
      "admin-status--toast",
      Boolean(message) && type === "success"
    );

    if (message && type === "success") {
      const timer = window.setTimeout(() => {
        element.hidden = true;
        element.textContent = "";
        element.classList.remove("admin-status--toast");
        statusTimers.delete(element);
      }, 3000);

      statusTimers.set(element, timer);
    }
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

    const accountResult =
      new URLSearchParams(
        window.location.search
      ).get("account");

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
    } else if (accountResult === "removed") {
      setStatus(
        status,
        "Your administrator account was permanently deleted.",
        "success"
      );
    } else if (accountResult === "access-removed") {
      setStatus(
        status,
        "Your administrator access was removed. Permanent account deletion still needs project-owner support.",
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
        if (hasRecentAdminActivity()) {
          rememberAdminActivity();

          window.location.replace(
            "admin-dashboard.html"
          );
          return;
        }

        forgetAdminActivity();
        await service.signOut({ scope: "local" });

        if (!queryError) {
          setStatus(
            status,
            "Your previous session expired after 15 minutes of inactivity. Please sign in again.",
            "error"
          );
        }
      } else if (existingUser) {
        forgetAdminActivity();
        await service.signOut({ scope: "local" });
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

          rememberAdminActivity();

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

    const pageTitle =
      dashboardPage.querySelector(
        "[data-admin-page-title]"
      );

    const pageDescription =
      dashboardPage.querySelector(
        "[data-admin-page-description]"
      );

    const newStoryButton =
      dashboardPage.querySelector(
        "[data-new-story]"
      );

    const TAB_CONTENT = {
      news: {
        title: "News Management",
        description:
          "Publish and manage MOTIC news updates.",
        action: "+ New Story",
      },
      posters: {
        title: "Upcoming Posters",
        description:
          "Manage the announcement slider on the home page.",
        action: "+ New Poster",
      },
      event: {
        title: "Event Management",
        description:
          "Add and arrange posters in the Event section.",
        action: "+ New Event",
      },
      activities: {
        title: "Activities Management",
        description:
          "Add and arrange photos from MOTIC activities.",
        action: "+ New Activity",
      },
      researcher_spotlight: {
        title: "Research Spotlight",
        description:
          "Feature MOTIC researchers on the home page.",
        action: "+ New Spotlight",
      },
      ictom: {
        title: "ICTOM Management",
        description:
          "Publish and arrange ICTOM content.",
        action: "+ New ICTOM Item",
      },
      president: {
        title: "President's Message",
        description:
          "Update the current President, message, session and photograph.",
        action: "Edit President",
      },
      team: {
        title: "Committee Management",
        description:
          "Update committee members and choose each position from a dropdown.",
        action: "+ New Member",
      },
      organizational_chart: {
        title: "Organizational Chart",
        description:
          "Replace the current organizational chart shown under About Us.",
        action: "Update Chart",
      },
      contact: {
        title: "Contact Us Management",
        description:
          "Update the public contact photos, email addresses and phone numbers.",
        action: "Edit Contact",
      },
      admin_access: {
        title: "Manage Administrators",
        description:
          "Invite accounts, transfer ownership and remove former administrators.",
        action: "Manage Admins",
      },
    };

    let activeTabKey = "news";

    function showTab(key) {
      const tabContent =
        TAB_CONTENT[key] || TAB_CONTENT.news;

      activeTabKey = key;

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

      if (pageTitle) {
        pageTitle.textContent =
          tabContent.title;
      }

      if (pageDescription) {
        pageDescription.textContent =
          tabContent.description;
      }

      if (newStoryButton) {
        newStoryButton.textContent =
          tabContent.action;
      }
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

    const logoutButton =
      dashboardPage.querySelector(
        "[data-admin-logout]"
      );

    const viewWebsiteLink =
      dashboardPage.querySelector(
        "[data-admin-view-website]"
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

    let allowDashboardExit = false;
    let stopSessionSecurity = () => {};

    let stories = [];
    let editingStory = null;
    let slugWasEdited = false;
    let posters = [];
    let editingPoster = null;

    const newsStat =
      dashboardPage.querySelector(
        '[data-admin-stat="news"]'
      );

    const posterStat =
      dashboardPage.querySelector(
        '[data-admin-stat="posters"]'
      );

    const galleryStat =
      dashboardPage.querySelector(
        '[data-admin-stat="gallery"]'
      );

    function updateDashboardStats() {
      if (newsStat) {
        newsStat.textContent =
          String(stories.length);
      }

      if (posterStat) {
        posterStat.textContent =
          String(posters.length);
      }

      if (galleryStat) {
        const galleryItems =
          dashboardPage.querySelectorAll(
            "[data-gallery-list] .admin-poster-row"
          );

        galleryStat.textContent =
          String(galleryItems.length);
      }
    }

    if (!service) {
      setStatus(
        status,
        "The admin service could not load. Check the page scripts.",
        "error"
      );
      return;
    }

    function installDashboardHistoryGuard() {
      const guardState = {
        moticAdminGuard: true,
      };

      window.history.replaceState(
        guardState,
        document.title,
        window.location.href
      );

      window.history.pushState(
        guardState,
        document.title,
        window.location.href
      );

      window.addEventListener("popstate", () => {
        if (allowDashboardExit) return;

        window.history.pushState(
          guardState,
          document.title,
          window.location.href
        );

        setStatus(
          status,
          "For security, use View website when you want to leave the admin dashboard.",
          "info"
        );
      });
    }

    function startSessionSecurity() {
      const warningPeriod = 60 * 1000;
      const activityEvents = [
        "pointerdown",
        "keydown",
        "touchstart",
        "scroll",
      ];

      let warningTimer = null;
      let logoutTimer = null;
      let isSigningOut = false;
      let lastRecordedAt = 0;

      const storedActivity =
        getAdminLastActivity();

      let lastActivity = Date.now();

      function clearTimers() {
        window.clearTimeout(warningTimer);
        window.clearTimeout(logoutTimer);
      }

      async function endInactiveSession() {
        if (isSigningOut) return;

        isSigningOut = true;
        clearTimers();
        allowDashboardExit = true;
        forgetAdminActivity();

        setStatus(
          status,
          "Your session ended after 15 minutes of inactivity.",
          "info"
        );

        try {
          await service.signOut({ scope: "local" });
        } catch (error) {
          console.warn(
            "The inactive session could not be cleared remotely.",
            error
          );
        } finally {
          window.location.replace(
            "admin.html?error=session-expired"
          );
        }
      }

      function scheduleTimers() {
        clearTimers();

        const elapsed = Date.now() - lastActivity;
        const remaining =
          ADMIN_INACTIVITY_LIMIT - elapsed;

        if (remaining <= 0) {
          endInactiveSession();
          return;
        }

        if (remaining > warningPeriod) {
          warningTimer = window.setTimeout(() => {
            setStatus(
              status,
              "For your security, this session will end in one minute unless you continue working.",
              "info"
            );
          }, remaining - warningPeriod);
        }

        logoutTimer = window.setTimeout(
          endInactiveSession,
          remaining
        );
      }

      function recordActivity() {
        const now = Date.now();

        if (now - lastRecordedAt < 1000) return;

        lastRecordedAt = now;
        lastActivity = now;
        rememberAdminActivity(lastActivity);

        if (
          status?.dataset.type === "info" &&
          status.textContent.startsWith("For your security")
        ) {
          setStatus(status);
        }

        scheduleTimers();
      }

      function checkWhenVisible() {
        if (document.visibilityState === "visible") {
          scheduleTimers();
        }
      }

      activityEvents.forEach((eventName) => {
        window.addEventListener(
          eventName,
          recordActivity,
          { passive: true }
        );
      });

      document.addEventListener(
        "visibilitychange",
        checkWhenVisible
      );

      if (
        !storedActivity ||
        !hasRecentAdminActivity(lastActivity)
      ) {
        endInactiveSession();
      } else {
        rememberAdminActivity(lastActivity);
        scheduleTimers();
      }

      return () => {
        clearTimers();

        activityEvents.forEach((eventName) => {
          window.removeEventListener(
            eventName,
            recordActivity
          );
        });

        document.removeEventListener(
          "visibilitychange",
          checkWhenVisible
        );
      };
    }

    installDashboardHistoryGuard();

    viewWebsiteLink?.addEventListener("click", () => {
      allowDashboardExit = true;
      stopSessionSecurity();
    });

    window.addEventListener("pageshow", (event) => {
      if (!event.persisted) return;

      allowDashboardExit = false;
      stopSessionSecurity();
      stopSessionSecurity = startSessionSecurity();
    });

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

      updateDashboardStats();
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

      updateDashboardStats();
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

        updateDashboardStats();
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
                  key,
                  editingItem?.imagePath || ""
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
                editingItem.imagePath &&
                newUpload.imagePath !== editingItem.imagePath
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
        reset: resetForm,
      };
    }

    const galleryPanels =
      GALLERY_SECTIONS.map(
        setupGalleryPanel
      );

    function setupPresidentPanel() {
      const panel = dashboardPage.querySelector(
        '[data-admin-panel="president"]'
      );

      if (!panel) return { load: async () => {}, reset: () => {} };

      const presidentForm = panel.querySelector("[data-president-form]");
      const currentPhoto = panel.querySelector("[data-president-current-photo]");
      const presidentSaveButton = presidentForm.querySelector("button[type='submit']");
      let presidentProfile = null;

      function fillPresidentForm() {
        presidentForm.elements.presidentName.value = presidentProfile?.name || "";
        presidentForm.elements.presidentSession.value = presidentProfile?.sessionLabel || "2025/2026";
        presidentForm.elements.presidentMessage.value = presidentProfile?.message || "";
        presidentForm.elements.presidentPhotoAlt.value = presidentProfile?.photoAlt || "";
        presidentForm.elements.presidentPhoto.value = "";
        currentPhoto.textContent = presidentProfile?.photo
          ? "A current photo is attached. Choose a file only to replace it."
          : "No President photo is attached yet.";
      }

      async function load() {
        presidentProfile = await service.getPresidentProfile({ allowFallback: false });
        fillPresidentForm();
      }

      presidentForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!presidentForm.reportValidity()) return;

        presidentSaveButton.disabled = true;
        presidentSaveButton.textContent = "Saving…";
        setStatus(status, "Saving President's message…", "info");

        const selectedPhoto = presidentForm.elements.presidentPhoto.files[0];
        let newUpload = null;

        try {
          if (selectedPhoto) {
            newUpload = await service.uploadPresidentPhoto(
              selectedPhoto,
              presidentProfile?.photoPath || ""
            );
          }

          presidentProfile = await service.savePresidentProfile({
            name: presidentForm.elements.presidentName.value,
            sessionLabel: presidentForm.elements.presidentSession.value,
            message: presidentForm.elements.presidentMessage.value,
            photo: newUpload?.image || presidentProfile?.photo || "",
            photoPath: newUpload?.imagePath || presidentProfile?.photoPath || "",
            photoAlt: presidentForm.elements.presidentPhotoAlt.value,
          });

          fillPresidentForm();
          setStatus(status, "President's message updated successfully.", "success");
        } catch (error) {
          if (newUpload?.imagePath && !presidentProfile?.photoPath) {
            try { await service.removeNewsImage(newUpload.imagePath); } catch (cleanupError) {
              console.warn("An unused President photo could not be removed.", cleanupError);
            }
          }
          setStatus(status, errorMessage(error), "error");
        } finally {
          presidentSaveButton.disabled = false;
          presidentSaveButton.textContent = "Save President's Message";
        }
      });

      return {
        load,
        reset: () => {
          presidentForm.scrollIntoView({ behavior: "smooth", block: "start" });
          presidentForm.elements.presidentName.focus({ preventScroll: true });
        },
      };
    }

    function setupTeamPanel() {
      const panel = dashboardPage.querySelector('[data-admin-panel="team"]');
      if (!panel) return { load: async () => {}, reset: () => {} };

      const memberForm = panel.querySelector("[data-team-member-form]");
      const memberFormTitle = panel.querySelector("[data-team-form-title]");
      const memberSaveButton = memberForm.querySelector("button[type='submit']");
      const memberCancelButton = memberForm.querySelector("[data-team-cancel]");
      const memberList = panel.querySelector("[data-team-member-list]");
      const teamEmpty = panel.querySelector("[data-team-empty]");
      const sessionInput = panel.querySelector("[data-team-session]");
      const sessionSaveButton = panel.querySelector("[data-team-session-save]");

      let teamSettings = { sessionLabel: "2025/2026", members: [] };
      let editingMemberId = null;
      let expandedTeamGroup = "Majlis Tertinggi";

      function resetMemberForm(scroll = false) {
        memberForm.reset();
        editingMemberId = null;
        memberForm.elements.teamGroup.value = "Majlis Tertinggi";
        memberForm.elements.teamPosition.value = "President";
        memberForm.elements.teamOrder.value = "1";
        memberFormTitle.textContent = "Add a committee member";
        memberSaveButton.textContent = "Add Member";
        memberCancelButton.hidden = true;

        if (scroll) {
          memberForm.scrollIntoView({ behavior: "smooth", block: "start" });
          memberForm.elements.teamName.focus({ preventScroll: true });
        }
      }

      function fillMemberForm(member) {
        editingMemberId = member.id;
        memberForm.elements.teamGroup.value = member.group;
        memberForm.elements.teamPosition.value = member.position;
        memberForm.elements.teamName.value = member.name;
        memberForm.elements.teamEmail.value = member.email;
        memberForm.elements.teamOrder.value = member.order;
        memberFormTitle.textContent = "Edit committee member";
        memberSaveButton.textContent = "Save Member";
        memberCancelButton.hidden = false;
        memberForm.scrollIntoView({ behavior: "smooth", block: "start" });
        memberForm.elements.teamName.focus({ preventScroll: true });
      }

      function renderMembers() {
        memberList.replaceChildren();
        teamEmpty.hidden = teamSettings.members.length > 0;

        const configuredGroups = Array.from(
          memberForm.elements.teamGroup.options,
          (option) => option.value
        );
        const groupRanks = new Map(
          configuredGroups.map((group, index) => [group, index])
        );
        const sortedMembers = [...teamSettings.members].sort((first, second) => {
          if (first.group === second.group) {
            return first.order - second.order || first.name.localeCompare(second.name);
          }

          const firstRank = groupRanks.get(first.group) ?? Number.MAX_SAFE_INTEGER;
          const secondRank = groupRanks.get(second.group) ?? Number.MAX_SAFE_INTEGER;
          return firstRank - secondRank || first.group.localeCompare(second.group);
        });

        const groupedMembers = new Map();
        sortedMembers.forEach((member) => {
          if (!groupedMembers.has(member.group)) groupedMembers.set(member.group, []);
          groupedMembers.get(member.group).push(member);
        });

        const groups = [...groupedMembers.entries()];
        if (!groups.length) {
          expandedTeamGroup = null;
          return;
        }

        if (!groupedMembers.has(expandedTeamGroup)) {
          expandedTeamGroup = groups[0][0];
        }

        memberList.classList.add("admin-team-groups");
        const groupControls = [];

        function updateExpandedGroup() {
          groupControls.forEach(({ group, toggle, groupPanel }) => {
            const isExpanded = group === expandedTeamGroup;
            toggle.setAttribute("aria-expanded", String(isExpanded));
            groupPanel.hidden = !isExpanded;
          });
        }

        groups.forEach(([group, members], groupIndex) => {
          const groupSection = document.createElement("section");
          groupSection.className = "admin-team-group";

          const toggle = document.createElement("button");
          toggle.className = "admin-team-group__toggle";
          toggle.type = "button";
          const toggleId = `admin-team-group-toggle-${groupIndex}`;
          const panelId = `admin-team-group-panel-${groupIndex}`;
          toggle.id = toggleId;
          toggle.setAttribute("aria-controls", panelId);

          const groupName = document.createElement("span");
          groupName.className = "admin-team-group__name";
          groupName.textContent = group;

          const memberCount = document.createElement("span");
          memberCount.className = "admin-team-group__count";
          memberCount.textContent = `${members.length} ${members.length === 1 ? "member" : "members"}`;

          const chevron = document.createElement("span");
          chevron.className = "admin-team-group__chevron";
          chevron.setAttribute("aria-hidden", "true");
          toggle.append(groupName, memberCount, chevron);

          const groupPanel = document.createElement("div");
          groupPanel.className = "admin-team-group__panel";
          groupPanel.id = panelId;
          groupPanel.setAttribute("role", "region");
          groupPanel.setAttribute("aria-labelledby", toggleId);

          members.forEach((member) => {
            const row = document.createElement("article");
            row.className = "admin-news-row admin-team-row";

            const information = document.createElement("div");
            information.className = "admin-news-row__content";
            const name = document.createElement("h3");
            name.textContent = member.name;
            const meta = document.createElement("p");
            meta.textContent = `${member.position} · ${member.group} · Order ${member.order}`;
            information.append(name, meta);

            const actions = document.createElement("div");
            actions.className = "admin-news-row__actions";
            const editButton = document.createElement("button");
            editButton.className = "admin-text-button";
            editButton.type = "button";
            editButton.textContent = "Edit";
            editButton.addEventListener("click", () => fillMemberForm(member));

            const deleteButton = document.createElement("button");
            deleteButton.className = "admin-text-button admin-text-button--danger";
            deleteButton.type = "button";
            deleteButton.textContent = "Delete";
            deleteButton.addEventListener("click", async () => {
              if (!window.confirm(`Delete ${member.name} from the committee?`)) return;
              deleteButton.disabled = true;
              const previousMembers = teamSettings.members;
              teamSettings = {
                ...teamSettings,
                members: previousMembers.filter((item) => item.id !== member.id),
              };

              try {
                teamSettings = await service.saveCommitteeSettings(teamSettings);
                if (editingMemberId === member.id) resetMemberForm();
                renderMembers();
                setStatus(status, "Committee member deleted successfully.", "success");
              } catch (error) {
                teamSettings = { ...teamSettings, members: previousMembers };
                setStatus(status, errorMessage(error), "error");
                deleteButton.disabled = false;
              }
            });

            actions.append(editButton, deleteButton);
            row.append(information, actions);
            groupPanel.append(row);
          });

          toggle.addEventListener("click", () => {
            expandedTeamGroup = expandedTeamGroup === group ? null : group;
            updateExpandedGroup();
          });

          groupControls.push({ group, toggle, groupPanel });
          groupSection.append(toggle, groupPanel);
          memberList.append(groupSection);
        });

        updateExpandedGroup();
      }

      async function load() {
        teamSettings = await service.getCommitteeSettings({ allowFallback: false }) || teamSettings;
        sessionInput.value = teamSettings.sessionLabel;
        renderMembers();
        resetMemberForm();
      }

      sessionSaveButton.addEventListener("click", async () => {
        if (!sessionInput.reportValidity()) return;
        sessionSaveButton.disabled = true;
        try {
          teamSettings = await service.saveCommitteeSettings({
            ...teamSettings,
            sessionLabel: sessionInput.value,
          });
          setStatus(status, "Committee session updated successfully.", "success");
        } catch (error) {
          setStatus(status, errorMessage(error), "error");
        } finally {
          sessionSaveButton.disabled = false;
        }
      });

      memberCancelButton.addEventListener("click", () => resetMemberForm(true));

      memberForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!memberForm.reportValidity()) return;

        memberSaveButton.disabled = true;
        memberCancelButton.disabled = true;
        const member = {
          id: editingMemberId || window.crypto?.randomUUID?.() || `member-${Date.now()}`,
          group: memberForm.elements.teamGroup.value,
          position: memberForm.elements.teamPosition.value,
          name: memberForm.elements.teamName.value,
          email: memberForm.elements.teamEmail.value,
          order: Number(memberForm.elements.teamOrder.value),
        };

        const wasEditing = Boolean(editingMemberId);
        const previousSettings = teamSettings;
        const nextMembers = wasEditing
          ? teamSettings.members.map((item) => item.id === editingMemberId ? member : item)
          : [...teamSettings.members, member];

        try {
          teamSettings = await service.saveCommitteeSettings({
            sessionLabel: sessionInput.value,
            members: nextMembers,
          });
          sessionInput.value = teamSettings.sessionLabel;
          renderMembers();
          resetMemberForm();
          setStatus(
            status,
            wasEditing ? "Committee member updated successfully." : "Committee member added successfully.",
            "success"
          );
        } catch (error) {
          teamSettings = previousSettings;
          setStatus(status, errorMessage(error), "error");
        } finally {
          memberSaveButton.disabled = false;
          memberCancelButton.disabled = false;
        }
      });

      return { load, reset: () => resetMemberForm(true) };
    }

    function setupOrganizationalChartPanel() {
      const panel = dashboardPage.querySelector('[data-admin-panel="organizational_chart"]');
      if (!panel) return { load: async () => {}, reset: () => {} };

      const chartForm = panel.querySelector("[data-organizational-chart-form]");
      const chartSaveButton = chartForm.querySelector("button[type='submit']");
      const deleteButton = panel.querySelector("[data-delete-organizational-chart]");
      const currentImage = panel.querySelector("[data-organizational-chart-current]");
      let chart = null;

      function fillChartForm() {
        chartForm.elements.chartTitle.value = chart?.title || "MOTIC Organizational Chart";
        chartForm.elements.chartSession.value = chart?.sessionLabel || "2025/2026";
        chartForm.elements.chartAlt.value = chart?.alt || "";
        chartForm.elements.chartImage.value = "";
        currentImage.textContent = chart?.image
          ? "A current chart is attached. Choose a file only to replace it."
          : "Upload the first organizational chart.";
        deleteButton.hidden = !chart;
      }

      async function load() {
        chart = await service.getOrganizationalChart({ allowFallback: false });
        fillChartForm();
      }

      chartForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!chartForm.reportValidity()) return;
        const selectedImage = chartForm.elements.chartImage.files[0];

        if (!selectedImage && !chart?.image) {
          setStatus(status, "Choose an organizational chart image before saving.", "error");
          chartForm.elements.chartImage.focus();
          return;
        }

        chartSaveButton.disabled = true;
        deleteButton.disabled = true;
        let newUpload = null;

        try {
          if (selectedImage) {
            newUpload = await service.uploadOrganizationalChart(
              selectedImage,
              chart?.imagePath || ""
            );
          }

          chart = await service.saveOrganizationalChart({
            title: chartForm.elements.chartTitle.value,
            sessionLabel: chartForm.elements.chartSession.value,
            image: newUpload?.image || chart?.image || "",
            imagePath: newUpload?.imagePath || chart?.imagePath || "",
            alt: chartForm.elements.chartAlt.value,
          });
          fillChartForm();
          setStatus(status, "Organizational chart updated successfully.", "success");
        } catch (error) {
          if (newUpload?.imagePath && !chart?.imagePath) {
            try { await service.removeNewsImage(newUpload.imagePath); } catch (cleanupError) {
              console.warn("An unused chart upload could not be removed.", cleanupError);
            }
          }
          setStatus(status, errorMessage(error), "error");
        } finally {
          chartSaveButton.disabled = false;
          deleteButton.disabled = false;
        }
      });

      deleteButton.addEventListener("click", async () => {
        if (!chart || !window.confirm("Delete the current organizational chart?")) return;
        deleteButton.disabled = true;
        const oldPath = chart.imagePath;
        try {
          await service.deleteOrganizationalChart();
          if (oldPath) await service.removeNewsImage(oldPath);
          chart = null;
          fillChartForm();
          setStatus(status, "Organizational chart deleted successfully.", "success");
        } catch (error) {
          setStatus(status, errorMessage(error), "error");
        } finally {
          deleteButton.disabled = false;
        }
      });

      return {
        load,
        reset: () => {
          chartForm.scrollIntoView({ behavior: "smooth", block: "start" });
          chartForm.elements.chartTitle.focus({ preventScroll: true });
        },
      };
    }

    function setupContactPanel() {
      const panel = dashboardPage.querySelector(
        '[data-admin-panel="contact"]'
      );

      if (!panel) {
        return {
          load: async () => {},
          reset: () => {},
        };
      }

      const contactForm = panel.querySelector(
        "[data-contact-form]"
      );

      const contactList = panel.querySelector(
        "[data-contact-list]"
      );

      const emptyMessage = panel.querySelector(
        "[data-contact-empty]"
      );

      const currentPhoto = panel.querySelector(
        "[data-contact-current-photo]"
      );

      const saveContactButton = contactForm.querySelector(
        "button[type='submit']"
      );

      const blueprints = {
        academic_leadership: {
          roleLabel: "Dr",
          kicker: "Academic leadership",
          displayOrder: 1,
        },
        advisor: {
          roleLabel: "Advisor",
          kicker: "Club guidance",
          displayOrder: 2,
        },
        president: {
          roleLabel: "President",
          kicker: "Student leadership",
          displayOrder: 3,
        },
        vice_president: {
          roleLabel: "Vice President",
          kicker: "Student leadership",
          displayOrder: 4,
        },
      };

      let contacts = [];

      function currentContact() {
        return contacts.find(
          (contact) =>
            contact.id ===
            contactForm.elements.contactPosition.value
        ) || null;
      }

      function fillContactForm(contact = null) {
        const selectedId = contact?.id ||
          contactForm.elements.contactPosition.value ||
          "academic_leadership";

        contactForm.elements.contactPosition.value = selectedId;
        contactForm.elements.contactName.value = contact?.name || "";
        contactForm.elements.contactEmail.value = contact?.email || "";
        contactForm.elements.contactPhone.value = contact?.phone || "";
        contactForm.elements.contactPhoto.value = "";
        contactForm.elements.contactPhotoAlt.value =
          contact?.photoAlt || "";

        currentPhoto.textContent = contact?.photo
          ? "A current photo is attached. Choose a new file only if you want to replace it."
          : "No contact photo is attached yet.";
      }

      function renderContacts() {
        contactList.replaceChildren();
        emptyMessage.hidden = contacts.length > 0;

        contacts.forEach((contact) => {
          const row = document.createElement("article");
          row.className = "admin-poster-row";

          const image = document.createElement("img");
          image.src = contact.photo
            ? resolvePosterImage(contact.photo)
            : "../assets/images/contact-portrait-placeholder.svg";
          image.alt = "";
          image.loading = "lazy";

          const information = document.createElement("div");
          information.className = "admin-poster-row__content";

          const name = document.createElement("h4");
          name.textContent = contact.name;

          const details = document.createElement("p");
          details.textContent = [
            contact.roleLabel,
            contact.email || "Email not added",
            contact.phone || "Phone not added",
          ].join(" · ");

          information.append(name, details);

          const actions = document.createElement("div");
          actions.className = "admin-news-row__actions";

          const editButton = document.createElement("button");
          editButton.className = "admin-text-button";
          editButton.type = "button";
          editButton.textContent = "Edit";

          editButton.addEventListener("click", () => {
            fillContactForm(contact);
            contactForm.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
            contactForm.elements.contactName.focus({
              preventScroll: true,
            });
          });

          actions.append(editButton);
          row.append(image, information, actions);
          contactList.append(row);
        });
      }

      async function load() {
        contacts = await service.getContactPeople({
          allowFallback: false,
        });

        renderContacts();

        const selected = currentContact() || contacts[0] || null;
        fillContactForm(selected);
      }

      contactForm.elements.contactPosition.addEventListener(
        "change",
        () => fillContactForm(currentContact())
      );

      contactForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (!contactForm.reportValidity()) return;

        const selectedId =
          contactForm.elements.contactPosition.value;

        const blueprint = blueprints[selectedId];
        const existingContact = currentContact();
        const selectedPhoto =
          contactForm.elements.contactPhoto.files[0];

        if (!blueprint) {
          setStatus(
            status,
            "Choose a valid Contact Us position.",
            "error"
          );
          return;
        }

        saveContactButton.disabled = true;
        saveContactButton.textContent = "Saving…";
        setStatus(status, "Saving contact details…", "info");

        let newUpload = null;

        try {
          if (selectedPhoto) {
            newUpload = await service.uploadContactPhoto(
              selectedPhoto
            );
          }

          await service.saveContactPerson({
            id: selectedId,
            roleLabel: blueprint.roleLabel,
            kicker: blueprint.kicker,
            displayOrder: blueprint.displayOrder,
            name: contactForm.elements.contactName.value,
            email: contactForm.elements.contactEmail.value,
            phone: contactForm.elements.contactPhone.value,
            photo: newUpload?.image || existingContact?.photo || "",
            photoPath:
              newUpload?.imagePath ||
              existingContact?.photoPath ||
              "",
            photoAlt:
              contactForm.elements.contactPhotoAlt.value,
          });

          if (
            newUpload &&
            existingContact?.photoPath &&
            existingContact.photoPath !== newUpload.imagePath
          ) {
            try {
              await service.removeNewsImage(
                existingContact.photoPath
              );
            } catch (imageError) {
              console.warn(
                "The old contact photo could not be removed.",
                imageError
              );
            }
          }

          await load();

          setStatus(
            status,
            `${blueprint.roleLabel} contact updated.`,
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
                "An unused contact photo could not be removed.",
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
          saveContactButton.disabled = false;
          saveContactButton.textContent = "Save Contact";
        }
      });

      return {
        load,
        reset: () => {
          fillContactForm(currentContact() || contacts[0] || null);
          contactForm.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
          contactForm.elements.contactPosition.focus({
            preventScroll: true,
          });
        },
      };
    }

    function setupAdminAccessPanel() {
      const panel = dashboardPage.querySelector('[data-admin-panel="admin_access"]');
      if (!panel) return { load: async () => {}, reset: () => {} };
      const inviteForm = panel.querySelector("[data-admin-invite-form]");
      const inviteButton = inviteForm.querySelector("button[type='submit']");
      const ownerControls = panel.querySelector("[data-admin-owner-controls]");
      const standardMessage = panel.querySelector("[data-admin-standard-message]");
      const adminList = panel.querySelector("[data-admin-access-list]");
      const loadingMessage = panel.querySelector("[data-admin-access-loading]");
      const emptyMessage = panel.querySelector("[data-admin-access-empty]");
      const accountCount = panel.querySelector("[data-admin-access-count]");

      let requesterRole = "admin";
      let admins = [];

      function formatAdminDate(value) {
        if (!value) return "Not signed in yet";

        return new Intl.DateTimeFormat("en-MY", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }).format(new Date(value));
      }

      function setRowBusy(row, busy) {
        row.querySelectorAll("button").forEach((button) => {
          button.disabled = busy;
        });
      }

      function createBadge(label, className = "") {
        const badge = document.createElement("span");
        badge.className = `admin-access-badge ${className}`.trim();
        badge.textContent = label;
        return badge;
      }

      function createAdminRow(admin) {
        const row = document.createElement("article");
        row.className = "admin-access-row";
        row.dataset.adminUserId = admin.userId;

        const identity = document.createElement("div");
        identity.className = "admin-access-row__identity";

        const emailLine = document.createElement("div");
        emailLine.className = "admin-access-row__email-line";

        const email = document.createElement("strong");
        email.textContent = admin.email;
        emailLine.append(email);

        if (admin.role === "owner") {
          emailLine.append(createBadge("Owner", "admin-access-badge--owner"));
        } else {
          emailLine.append(createBadge("Admin"));
        }

        if (admin.isCurrent) {
          emailLine.append(createBadge("You", "admin-access-badge--you"));
        }

        const details = document.createElement("p");
        details.textContent = admin.emailConfirmed
          ? `Last sign-in: ${formatAdminDate(admin.lastSignInAt)}`
          : `Invitation pending · Added ${formatAdminDate(admin.createdAt)}`;

        identity.append(emailLine, details);
        row.append(identity);

        const ownerManagingAnother =
          requesterRole === "owner" && !admin.isCurrent;

        const adminDeletingSelf =
          requesterRole === "admin" && admin.isCurrent;

        if (ownerManagingAnother || adminDeletingSelf) {
          const actions = document.createElement("div");
          actions.className = "admin-access-row__actions";

          if (ownerManagingAnother) {
            const transferButton = document.createElement("button");
            transferButton.className = "admin-secondary-button";
            transferButton.type = "button";
            transferButton.textContent = "Make Owner";

            transferButton.addEventListener("click", async () => {
              const confirmed = window.confirm(
                `Transfer Owner control to ${admin.email}? You will become a normal administrator and can then delete your own account.`
              );

              if (!confirmed) return;

              setRowBusy(row, true);

              try {
                await service.transferAdminOwnership(admin.userId);
                await load();
                setStatus(
                  status,
                  `Ownership transferred to ${admin.email}. You can now delete your own account if the handover is complete.`,
                  "success"
                );
              } catch (error) {
                setStatus(status, errorMessage(error), "error");
                setRowBusy(row, false);
              }
            });

            actions.append(transferButton);
          }

          const removeButton = document.createElement("button");
          removeButton.className = "admin-secondary-button admin-danger-button";
          removeButton.type = "button";
          removeButton.textContent = adminDeletingSelf
            ? "Delete My Account"
            : "Remove";

          removeButton.addEventListener("click", async () => {
            const confirmed = window.confirm(
              adminDeletingSelf
                ? "Permanently delete your own administrator account? You will be signed out immediately. Your published website content will remain, but this action cannot be undone."
                : `Permanently delete ${admin.email} as an administrator? Their published website content will remain.`
            );

            if (!confirmed) return;

            setRowBusy(row, true);

            try {
              const response = await service.removeAdmin(admin.userId);

              if (response.removedCurrentAccount) {
                try {
                  await service.signOut();
                } finally {
                  window.location.replace("admin.html?account=removed");
                }
                return;
              }

              await load();
              setStatus(
                status,
                `${admin.email} was permanently removed.`,
                "success"
              );
            } catch (error) {
              if (error?.accessRemoved) {
                if (error.removedCurrentAccount || adminDeletingSelf) {
                  try {
                    await service.signOut();
                  } finally {
                    window.location.replace(
                      "admin.html?account=access-removed"
                    );
                  }
                  return;
                }

                await load();
              } else {
                setRowBusy(row, false);
              }

              setStatus(status, errorMessage(error), "error");
            }
          });

          actions.append(removeButton);
          row.append(actions);
        }

        return row;
      }

      function render() {
        adminList.replaceChildren();

        const isOwner = requesterRole === "owner";
        ownerControls.hidden = !isOwner;
        standardMessage.hidden = isOwner;
        emptyMessage.hidden = admins.length !== 0;
        accountCount.textContent = `${admins.length} ${admins.length === 1 ? "account" : "accounts"}`;

        admins.forEach((admin) => {
          adminList.append(createAdminRow(admin));
        });
      }

      async function load() {
        loadingMessage.hidden = false;
        loadingMessage.textContent = "Loading administrators…";
        emptyMessage.hidden = true;
        ownerControls.hidden = true;
        standardMessage.hidden = true;
        adminList.replaceChildren();

        try {
          const response = await service.getAdmins();
          requesterRole = response.requesterRole;
          admins = Array.isArray(response.admins) ? response.admins : [];
          render();
          loadingMessage.hidden = true;
        } catch (error) {
          accountCount.textContent = "Unavailable";
          loadingMessage.textContent =
            `Administrators could not be loaded: ${errorMessage(error)}`;
          loadingMessage.hidden = false;
          throw error;
        }
      }

      inviteForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!inviteForm.reportValidity()) return;
        inviteButton.disabled = true;
        inviteButton.textContent = "Sending…";
        try {
          await service.inviteAdmin(inviteForm.elements.adminInviteEmail.value);
          inviteForm.reset();
          await load();
          setStatus(status, "Admin invitation sent successfully.", "success");
        } catch (error) {
          setStatus(status, errorMessage(error), "error");
        } finally {
          inviteButton.disabled = false;
          inviteButton.textContent = "Send Admin Invitation";
        }
      });

      return {
        load,
        reset: () => {
          panel.scrollIntoView({ behavior: "smooth", block: "start" });

          if (requesterRole === "owner") {
            inviteForm.elements.adminInviteEmail.focus({ preventScroll: true });
          }
        },
      };
    }

    const presidentPanel = setupPresidentPanel();
    const teamPanel = setupTeamPanel();
    const organizationalChartPanel = setupOrganizationalChartPanel();
    const contactPanel = setupContactPanel();
    const adminAccessPanel = setupAdminAccessPanel();

    const additionalPanels = {
      president: presidentPanel,
      team: teamPanel,
      organizational_chart: organizationalChartPanel,
      contact: contactPanel,
      admin_access: adminAccessPanel,
    };

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
                selectedImage,
                editingPoster?.imagePath || ""
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
              editingPoster.imagePath &&
              newUpload.imagePath !== editingPoster.imagePath
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

    newStoryButton?.addEventListener(
      "click",
      () => {
        if (activeTabKey === "news") {
          resetForm(true);
          return;
        }

        if (activeTabKey === "posters") {
          resetPosterForm(true);
          return;
        }

        if (additionalPanels[activeTabKey]) {
          additionalPanels[activeTabKey].reset();
          return;
        }

        const galleryIndex =
          GALLERY_SECTIONS.findIndex(
            (section) =>
              section.key === activeTabKey
          );

        galleryPanels[galleryIndex]
          ?.reset(true);
      }
    );

    logoutButton.addEventListener(
      "click",
      async () => {
        logoutButton.disabled = true;
        allowDashboardExit = true;
        stopSessionSecurity();
        forgetAdminActivity();

        try {
          await service.signOut({ scope: "local" });
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
                selectedImage,
                editingStory?.imagePath || ""
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
              editingStory.imagePath &&
              newUpload.imagePath !== editingStory.imagePath
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
      if (!hasRecentAdminActivity()) {
        allowDashboardExit = true;
        forgetAdminActivity();

        try {
          await service.signOut({ scope: "local" });
        } catch (error) {
          console.warn(
            "The expired session could not be cleared remotely.",
            error
          );
        } finally {
          window.location.replace(
            "admin.html?error=session-expired"
          );
        }

        return;
      }

      const user =
        await service.getCurrentUser();

      if (!user) {
        allowDashboardExit = true;

        window.location.replace(
          "admin.html?error=session-expired"
        );
        return;
      }

      if (!await service.isAdmin(user)) {
        allowDashboardExit = true;
        await service.signOut();

        window.location.replace(
          "admin.html?error=not-authorized"
        );
        return;
      }

      accountEmail.textContent =
        user.email ||
        "Authorized administrator";

      rememberAdminActivity();

      service.onAuthStateChange?.((event) => {
        if (
          event !== "SIGNED_OUT" ||
          allowDashboardExit
        ) {
          return;
        }

        allowDashboardExit = true;
        stopSessionSecurity();
        forgetAdminActivity();

        window.location.replace(
          "admin.html?error=session-expired"
        );
      });

      stopSessionSecurity = startSessionSecurity();

      resetForm();
      resetPosterForm();

      await Promise.all([
        loadStories(),
        loadPosters(),
        ...galleryPanels.map(
          (panel) => panel.load()
        ),
        presidentPanel.load(),
        teamPanel.load(),
        organizationalChartPanel.load(),
        contactPanel.load(),
        adminAccessPanel.load(),
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
