// Keep aligned with MAX_IMAGE_BYTES in src/config/image-upload.ts.
const maximumImageBytes = 5 * 1024 * 1024;

async function readUploadError(response) {
  const fallbackMessages = {
    400: "The upload was rejected. Check your images and form entries.",
    403: "Your form submission has expired or is invalid. Copy your text before reloading the editor.",
    404: "This content could not be found. Copy any unsaved text before leaving.",
    413: "The upload is too large. Each image must be 5 MiB or smaller.",
    415: "The upload format is unsupported. Reload the editor after copying your text.",
    503: "Uploads are temporarily unavailable. Please try again shortly."
  };

  const fallback =
    fallbackMessages[response.status] ??
    "The save could not be confirmed. Check the dashboard before trying again.";

  if (response.status >= 500 && response.status !== 503) {
    return fallback;
  }

  const contentType =
    response.headers.get("content-type") ?? "";

  const body = await response.text();

  if (contentType.includes("text/plain")) {
    return body.trim().slice(0, 1000) || fallback;
  }

  if (contentType.includes("text/html")) {
    const document = new DOMParser().parseFromString(
      body,
      "text/html"
    );

    const message = document
      .querySelector("#form-error")
      ?.textContent
      ?.trim();

    return message?.slice(0, 1000) || fallback;
  }

  return fallback;
}

document
  .querySelectorAll('form[enctype="multipart/form-data"]')
  .forEach((form, formIndex) => {
    const inputs = Array.from(
      form.querySelectorAll('input[type="file"]')
    );

    if (inputs.length === 0) {
      return;
    }

    let saving = false;

    const serverError = document.createElement("div");
    serverError.hidden = true;
    serverError.tabIndex = -1;
    serverError.setAttribute("role", "alert");

    const serverMessage = document.createElement("p");
    const reload = document.createElement("a");

    reload.href = window.location.href;
    reload.textContent =
      "Reload the editor (discards unsaved entries)";

    serverError.append(serverMessage, reload);
    form.prepend(serverError);

    function showServerError(message) {
      serverMessage.textContent = message;
      serverError.hidden = false;
      serverError.focus();
    }

    const fields = inputs.map((input, inputIndex) => {
      const error = document.createElement("p");

      error.id =
        `upload-size-error-${formIndex}-${inputIndex}`;
      error.hidden = true;
      error.setAttribute("role", "alert");

      const container = input.closest("p") ?? input;
      container.insertAdjacentElement("afterend", error);

      input.setAttribute(
        "aria-describedby",
        [
          input.getAttribute("aria-describedby"),
          error.id
        ].filter(Boolean).join(" ")
      );

      function validate() {
        const oversized = Array.from(
          input.files ?? []
        ).some(file => file.size > maximumImageBytes);

        const message = oversized
          ? "This image exceeds 5 MiB. Choose a smaller image. Your text entries are still here."
          : "";

        input.setCustomValidity(message);
        error.textContent = message;
        error.hidden = !oversized;

        if (oversized) {
          input.setAttribute("aria-invalid", "true");
        } else {
          input.removeAttribute("aria-invalid");
        }

        return !oversized;
      }

      input.addEventListener("change", validate);
      input.addEventListener("invalid", validate);

      return { input, validate };
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      if (saving) {
        return;
      }

      let firstInvalid = null;

      fields.forEach(({ input, validate }) => {
        if (!validate() && firstInvalid === null) {
          firstInvalid = input;
        }
      });

      if (firstInvalid) {
        firstInvalid.focus();
        firstInvalid.reportValidity();
        return;
      }

      const body = new FormData(form);

      const controls = Array.from(
        form.querySelectorAll(
          "input, textarea, select, button"
        )
      ).map(control => ({
        control,
        wasDisabled: control.disabled
      }));

      saving = true;
      serverError.hidden = true;
      form.setAttribute("aria-busy", "true");
      form.dispatchEvent(new Event("editor:saving"));

      controls.forEach(({ control }) => {
        control.disabled = true;
      });

      try {
        const response = await fetch(form.action, {
          method: "POST",
          body,
          credentials: "same-origin"
        });

        const destination = new URL(
          response.url,
          window.location.href
        );

        if (
          response.ok &&
          response.redirected &&
          destination.origin === window.location.origin &&
          destination.pathname === "/admin"
        ) {
          form.dispatchEvent(new Event("editor:saved"));
          window.location.assign(destination.href);
          return;
        }

        if (response.redirected) {
          showServerError(
            "The editor could not complete the save. Your session may have expired. Copy your text before signing in again."
          );
          return;
        }

        showServerError(
          await readUploadError(response)
        );
      } catch {
        showServerError(
          "The save could not be confirmed. Your entries are still here. Check the dashboard before trying again."
        );
      } finally {
        controls.forEach(({ control, wasDisabled }) => {
          control.disabled = wasDisabled;
        });

        saving = false;
        form.removeAttribute("aria-busy");
        form.dispatchEvent(new Event("editor:finished"));
      }
    });
  });