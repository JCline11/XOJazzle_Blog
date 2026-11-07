document.querySelectorAll("[data-delete-dialog]").forEach((trigger) => {
  const dialog = document.getElementById(trigger.dataset.deleteDialog);

  if (!dialog || typeof dialog.showModal !== "function") {
    return;
  }

  const form = dialog.querySelector("form");
  const cancel = dialog.querySelector("[data-cancel-delete]");
  const confirm = dialog.querySelector('[type="submit"]');
  let submitting = false;

  trigger.hidden = false;

  trigger.addEventListener("click", () => {
    if (!dialog.open) {
      dialog.showModal();
    }
  });

  cancel.addEventListener("click", () => dialog.close());

  form.addEventListener("submit", (event) => {
    if (!dialog.open || submitting) {
      event.preventDefault();
      return;
    }

    submitting = true;
    confirm.disabled = true;
    confirm.textContent = "deleting…";
  });
});
