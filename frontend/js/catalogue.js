/* Recherche, filtres et tri du catalogue. */
(function () {
  "use strict";

  const api = window.ChezMaty;
  if (!api) return;

  const form = document.getElementById("catalogue-filters");
  const grid = document.getElementById("catalogue-products");
  const count = document.getElementById("results-count");
  const empty = document.getElementById("catalogue-empty");
  const errorMessage = document.getElementById("catalogue-error");
  const categorySelect = document.getElementById("filter-category");
  let categoriesById = new Map();
  let debounceTimer = 0;

  function setLoading() {
    grid.replaceChildren();
    for (let index = 0; index < 4; index += 1) {
      const skeleton = document.createElement("div");
      skeleton.className = "product-skeleton skeleton";
      grid.append(skeleton);
    }
    empty.hidden = true;
    errorMessage.hidden = true;
    count.textContent = "Recherche dans nos créations…";
  }

  async function loadCategories() {
    try {
      const categories = await api.apiFetch("/categories");
      categoriesById = new Map(categories.map((category) => [category.id, category.name]));
      categories.forEach((category) => {
        const option = document.createElement("option");
        option.value = category.slug;
        option.textContent = category.name;
        categorySelect.append(option);
      });
      const requestedCategory = new URLSearchParams(window.location.search).get("category");
      if (requestedCategory && categories.some((category) => category.slug === requestedCategory)) {
        categorySelect.value = requestedCategory;
      }
    } catch (error) {
      errorMessage.hidden = false;
      errorMessage.textContent = `Impossible de charger les catégories : ${error.message}`;
      console.error("Erreur de chargement des catégories :", error);
    }
  }

  function readFilters() {
    const params = new URLSearchParams();
    const values = {
      q: document.getElementById("filter-search").value.trim(),
      category: categorySelect.value,
      min_price: document.getElementById("filter-min-price").value,
      max_price: document.getElementById("filter-max-price").value,
      age: document.getElementById("filter-age").value,
      color: document.getElementById("filter-color").value,
      sort: document.getElementById("filter-sort").value
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params;
  }

  async function loadProducts() {
    setLoading();
    try {
      const params = readFilters();
      params.set("limit", "100");
      const products = await api.apiFetch(`/products?${params.toString()}`);
      grid.replaceChildren();
      count.textContent = `${products.length} création${products.length === 1 ? "" : "s"} à découvrir`;
      empty.hidden = products.length > 0;
      products.forEach((product) => grid.append(api.createProductCard(product, categoriesById.get(product.category_id))));
    } catch (error) {
      grid.replaceChildren();
      count.textContent = "Le catalogue n’a pas pu être chargé.";
      empty.hidden = true;
      errorMessage.hidden = false;
      errorMessage.textContent = error.message || "Impossible de charger les produits. Réessayez dans quelques instants.";
      console.error("Erreur de chargement du catalogue :", error);
    }
  }

  function scheduleSearch() {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(loadProducts, 250);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    loadProducts();
  });
  form.addEventListener("change", (event) => {
    if (event.target instanceof HTMLSelectElement) loadProducts();
  });
  document.getElementById("filter-search").addEventListener("input", scheduleSearch);
  document.getElementById("reset-filters").addEventListener("click", () => {
    window.setTimeout(() => {
      categorySelect.value = "";
      loadProducts();
    }, 0);
  });
  document.getElementById("empty-reset").addEventListener("click", () => {
    form.reset();
    categorySelect.value = "";
    loadProducts();
  });

  async function init() {
    const params = new URLSearchParams(window.location.search);
    document.getElementById("filter-sort").value = params.get("sort") || "newest";
    const requestedSearch = params.get("q");
    if (requestedSearch) document.getElementById("filter-search").value = requestedSearch;
    await loadCategories();
    await loadProducts();
  }

  init();
}());
