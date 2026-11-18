const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");
const publicHeader = document.querySelector(".public-site-header");

if (
  menuToggle &&
  siteNav &&
  publicHeader &&
  typeof window.matchMedia === "function"
) {
  const mobile = window.matchMedia("(max-width: 800px)");
  const links = Array.from(
    document.querySelectorAll(".site-nav a")
  );

  let open = false;

  function renderNavigation() {
    const expanded = mobile.matches && open;

    const toggleHadFocus =
      document.activeElement === menuToggle;

    const navigationHadFocus =
      siteNav.contains(document.activeElement);

    menuToggle.hidden = !mobile.matches;
    siteNav.hidden = mobile.matches && !expanded;

    siteNav.classList.toggle("open", expanded);

    menuToggle.setAttribute(
      "aria-expanded",
      String(expanded)
    );

    if (siteNav.hidden && navigationHadFocus) {
      menuToggle.focus();
    }

    if (!mobile.matches && toggleHadFocus) {
      links[0]?.focus();
    }
  }

  function closeNavigation(restoreFocus = false) {
    open = false;
    renderNavigation();

    if (restoreFocus && mobile.matches) {
      menuToggle.focus();
    }
  }

  menuToggle.addEventListener("click", () => {
    open = !open;
    renderNavigation();
  });

  links.forEach((link) => {
    link.addEventListener("click", () => {
      if (mobile.matches) {
        closeNavigation();
      }
    });
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      mobile.matches &&
      open
    ) {
      event.preventDefault();
      closeNavigation(true);
    }
  });

  document.addEventListener("click", (event) => {
    if (!publicHeader.contains(event.target)) {
      closeNavigation();
    }
  });

  document.addEventListener("focusin", (event) => {
    if (
      mobile.matches &&
      open &&
      !publicHeader.contains(event.target)
    ) {
      closeNavigation();
    }
  });

  mobile.addEventListener("change", () => {
    open = false;
    renderNavigation();
  });

  publicHeader.classList.add("navigation-ready");
  renderNavigation();
}