(() => {
  const page = document.querySelector("[data-accept-invite]");
  if (!page) return;

  const form = page.querySelector("[data-accept-invite-form]");
  const status = page.querySelector("[data-accept-invite-status]");
  const submitButton = form.querySelector("button[type='submit']");

  function setStatus(message = "", type = "info") {
    status.textContent = message;
    status.dataset.type = type;
    status.hidden = !message;
  }

  async function initialise() {
    if (!window.moticSupabase) {
      setStatus("The invitation service could not load.", "error");
      submitButton.disabled = true;
      return;
    }

    const { data, error } = await window.moticSupabase.auth.getSession();

    if (error || !data.session) {
      setStatus(
        "Open this page from the latest invitation email. The link may have expired or already been used.",
        "error"
      );
      submitButton.disabled = true;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const password = form.elements.password.value;
    const confirmation = form.elements.passwordConfirm.value;

    if (password !== confirmation) {
      setStatus("The two passwords do not match.", "error");
      form.elements.passwordConfirm.focus();
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Activating…";
    setStatus("Saving your password…", "info");

    const { error } = await window.moticSupabase.auth.updateUser({ password });

    if (error) {
      setStatus(error.message, "error");
      submitButton.disabled = false;
      submitButton.textContent = "Activate Admin Account";
      return;
    }

    setStatus("Your admin account is ready. Opening the dashboard…", "success");
    window.setTimeout(() => {
      window.location.replace("admin-dashboard.html");
    }, 1200);
  });

  initialise();
})();
