const postFilterPanel =
  document.querySelector("[data-post-filters]");

if (postFilterPanel) {
  const rows = Array.from(
    document.querySelectorAll("[data-post-row]")
  );

  const statusFilter =
    document.querySelector("[data-post-status]");

  const categoryFilter =
    document.querySelector("[data-post-category]");

  const resetFilters =
    document.querySelector("[data-reset-post-filters]");

  const postCount =
    document.querySelector("[data-post-count]");

  const emptyResult =
    document.querySelector("[data-post-filter-empty]");

  if (rows.length > 0) {
    function applyFilters() {
      let visible = 0;

      rows.forEach((row) => {
        const matchesStatus =
          statusFilter.value === "all" ||
          row.dataset.status === statusFilter.value;

        const matchesCategory =
          categoryFilter.value === "all" ||
          row.dataset.category === categoryFilter.value;

        row.hidden = !(matchesStatus && matchesCategory);

        if (!row.hidden) {
          visible += 1;
        }
      });

      postCount.textContent =
        `Showing ${visible} of ${rows.length} posts.`;

      emptyResult.hidden = visible !== 0;
    }

    statusFilter.addEventListener("change", applyFilters);
    categoryFilter.addEventListener("change", applyFilters);

    resetFilters.addEventListener("click", () => {
      statusFilter.value = "all";
      categoryFilter.value = "all";
      applyFilters();
    });

    applyFilters();
    postFilterPanel.hidden = false;
  }
}