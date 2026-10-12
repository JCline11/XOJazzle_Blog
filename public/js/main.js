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
    document.querySelectorAll(".site-nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
  });
});

// Latest-note category filters
const filters = document.querySelectorAll(".filter");
const posts = document.querySelectorAll(".post-card");

filters.forEach((filter) => {
  filter.addEventListener("click", () => {
    const selectedCategory = filter.dataset.filter;
    filters.forEach((item) => item.classList.toggle("active", item === filter));
    posts.forEach((post) => {
      const shouldShow = selectedCategory === "all" || post.dataset.category === selectedCategory;
      post.style.display = shouldShow ? "" : "none";
    });
  });
});

// Reveal scrapbook elements as they enter the viewport.
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add("is-visible");
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.08 });

document.querySelectorAll(".love-card, .post-card, .diary-entry, .about-photo").forEach((element) => {
  element.classList.add("reveal");
  revealObserver.observe(element);
});

// Keeping motion here makes it easy to find and adjust later.
const revealStyles = document.createElement("style");
revealStyles.textContent = `
  .reveal { opacity: 0; transform: translateY(14px); transition: opacity .65s ease, transform .65s ease; }
  .reveal.is-visible { opacity: 1; transform: none; }
`;
document.head.appendChild(revealStyles);
