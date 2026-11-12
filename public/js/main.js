// Mobile navigation
const menuToggle = document.querySelector(".menu-toggle");
const siteNav = document.querySelector(".site-nav");

menuToggle?.addEventListener("click", () => {
  const isOpen = siteNav.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

document.querySelectorAll(".site-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    siteNav.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");

    document.querySelectorAll(".site-nav a").forEach((item) => {
      item.classList.remove("active");
    });

    link.classList.add("active");
  });
});

// Reveal styles live in style.css so they follow the site's CSP.
// Leave content visible when IntersectionObserver is unavailable.
if ("IntersectionObserver" in window) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });

  document
    .querySelectorAll(
      ".love-card, .post-card, .watchlist-card, .about-photo"
    )
    .forEach((element) => {
      element.classList.add("reveal");
      revealObserver.observe(element);
    });
}