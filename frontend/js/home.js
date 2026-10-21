/* Chargement du contenu de la page d'accueil depuis l'API. */
(function () {
  "use strict";

  const api = window.ChezMaty;
  if (!api) return;

  const categoryArt = [
    { image: "images/coffret-welcome-baby-rose.jpeg", match: /coffret|welcome|naissance/i },
    { image: "images/tetine-personnalisee-rose.jpeg", match: /t[eé]tine|attache|sucette/i },
    { image: "images/gateau-couches-bleu.jpeg", match: /g[aâ]teau|couche|ballon/i }
  ];

  function categoryImage(name, index) {
    const found = categoryArt.find((item) => item.match.test(name));
    return found ? found.image : categoryArt[index % categoryArt.length].image;
  }

  function showMessage(id, message, isError) {
    const element = document.getElementById(id);
    if (!element) return;
    element.hidden = false;
    element.textContent = message;
    if (isError) element.classList.add("error-text");
  }

  function renderCategories(categories) {
    const grid = document.getElementById("home-categories");
    if (!grid) return;
    grid.replaceChildren();
    if (!categories.length) {
      showMessage("category-message", "Les catégories sont en préparation. Revenez découvrir nos créations très bientôt.");
      return;
    }
    categories.slice(0, 6).forEach((category, index) => {
      const link = document.createElement("a");
      link.className = "category-card";
      link.href = `catalogue.html?category=${encodeURIComponent(category.slug)}`;
      const copy = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = category.name;
      const subtitle = document.createElement("span");
      subtitle.textContent = category.description || "Des cadeaux préparés avec amour";
      copy.append(title, subtitle);
      const image = document.createElement("img");
      image.src = categoryImage(category.name, index);
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      link.append(copy, image);
      grid.append(link);
    });
  }

  function renderProducts(products, targetId, messageId, emptyText, categoryById) {
    const grid = document.getElementById(targetId);
    if (!grid) return;
    grid.replaceChildren();
    if (!products.length) {
      showMessage(messageId, emptyText);
      return;
    }
    products.forEach((product) => {
      grid.append(api.createProductCard(product, categoryById.get(product.category_id)));
    });
  }

  async function loadHome() {
    try {
      const [categories, products] = await Promise.all([
        api.apiFetch("/categories"),
        api.apiFetch("/products?limit=24&sort=newest")
      ]);
      const categoryById = new Map(categories.map((category) => [category.id, category.name]));
      renderCategories(categories);
      const featured = products.filter((product) => product.is_featured).slice(0, 4);
      renderProducts(featured, "popular-products", "popular-message", "Nos créations coups de cœur seront bientôt disponibles.", categoryById);
      renderProducts(products.slice(0, 4), "new-products", "new-message", "De nouvelles créations seront bientôt disponibles.", categoryById);
    } catch (error) {
      document.querySelectorAll(".product-skeleton, .category-skeleton").forEach((skeleton) => skeleton.remove());
      showMessage("category-message", "Impossible de charger les catégories. Vérifiez que l’API fonctionne, puis actualisez la page.", true);
      showMessage("popular-message", "Impossible de joindre la boutique pour le moment. Vérifiez que l’API fonctionne, puis actualisez la page.", true);
      showMessage("new-message", error.message || "Les nouveautés ne sont pas accessibles pour le moment.", true);
      console.error("Erreur de chargement de l'accueil :", error);
    }
  }

  loadHome();
}());
