document
  .querySelectorAll('form[enctype="multipart/form-data"]')
  .forEach((form) => {
    const controls = Array.from(form.elements).filter(
      control =>
        control.name &&
        !["hidden", "submit", "button", "reset"].includes(
          control.type
        )
    );

    function snapshot() {
      return JSON.stringify(
        controls.map((control) => {
          if (control.type === "file") {
            return [
              control.name,
              Array.from(control.files ?? []).map(file => [
                file.name,
                file.size,
                file.lastModified,
                file.type
              ])
            ];
          }

          if (control.multiple && control.selectedOptions) {
            return [
              control.name,
              Array.from(
                control.selectedOptions,
                option => option.value
              )
            ];
          }

          return [control.name, control.value];
        })
      );
    }

    let savedSnapshot = snapshot();
    let saving = false;
    let allowNavigation = false;

    function hasChanges() {
      return snapshot() !== savedSnapshot;
    }

    form.addEventListener("editor:saving", () => {
      saving = true;
    });

    form.addEventListener("editor:finished", () => {
      saving = false;
    });

    form.addEventListener("editor:saved", () => {
      savedSnapshot = snapshot();
      saving = false;
      allowNavigation = true;
    });

    window.addEventListener("pageshow", () => {
      allowNavigation = false;
    });

    window.addEventListener("beforeunload", (event) => {
      if (
        allowNavigation ||
        (!saving && !hasChanges())
      ) {
        return;
      }

      event.preventDefault();
      event.returnValue = true;
    });

    document.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const anchor = event.target?.closest?.("a[href]");

      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const destination = new URL(
        anchor.href,
        window.location.href
      );

      if (
        !["http:", "https:"].includes(destination.protocol)
      ) {
        return;
      }

      const current = new URL(window.location.href);

      // Moving to an anchor on this page does not discard the form.
      if (
        destination.origin === current.origin &&
        destination.pathname === current.pathname &&
        destination.search === current.search &&
        destination.hash
      ) {
        return;
      }

      if (!saving && !hasChanges()) {
        return;
      }

      const message = saving
        ? "A save is still running. Leaving will not cancel it. Leave this page?"
        : "Discard your unsaved changes and leave this page?";

      if (!window.confirm(message)) {
        event.preventDefault();
        return;
      }

      allowNavigation = true;
    });
  });