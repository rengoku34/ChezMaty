/* Fiche produit, personnalisation, avis et partage. */
(function () {
  "use strict";

  const api = window.ChezMaty;
  if (!api) return;

  const slug = new URLSearchParams(window.location.search).get("slug");
  const loading = document.getElementById("detail-loading");
  const error = document.getElementById("detail-error");
  const detail = document.getElementById("product-detail");
  const nameInput = document.getElementById("custom-name");
  const previewName = document.getElementById("personalization-preview");
  let currentProduct = null;

  function showError(message) {
    loading.hidden = true;
    detail.hidden = true;
    error.hidden = false;
    error.textContent = message;
  }

  function renderGallery(product) {
    const images = Array.isArray(product.images) ? [...product.images] : [];
    images.sort((left, right) => left.position - right.position);
    const mainImage = document.getElementById("product-image");
    const thumbnails = document.getElementById("product-thumbnails");
    thumbnails.replaceChildren();
    if (!images.length) {
      mainImage.src = api.FALLBACK_IMAGE;
      mainImage.alt = product.name;
      api.setUpImage(mainImage, product.name);
      return;
    }
    mainImage.src = api.resolveImageUrl(images[0].image_path);
    api.setUpImage(mainImage, images[0].alt_text || product.name);
    images.forEach((item, index) => {
      const button = document.createElement("button");
      button.className = "thumbnail-button";
      button.type = "button";
      button.setAttribute("aria-label", `Afficher la photo ${index + 1}`);
      button.setAttribute("aria-pressed", String(index === 0));
      const image = document.createElement("img");
      image.src = api.resolveImageUrl(item.image_path);
      image.alt = "";
      api.setUpImage(image, "", api.FALLBACK_IMAGE);
      button.append(image);
      button.addEventListener("click", () => {
        mainImage.src = api.resolveImageUrl(item.image_path);
        api.setUpImage(mainImage, item.alt_text || product.name);
        thumbnails.querySelectorAll(".thumbnail-button").forEach((thumbnail) => {
          thumbnail.setAttribute("aria-pressed", String(thumbnail === button));
        });
      });
      thumbnails.append(button);
    });
  }

  function updatePreview() {
    previewName.textContent = nameInput.value.trim() || "Bébé";
  }

  function updateShareLinks(product) {
    const productUrl = window.location.href;
    const text = `Découvre ${product.name} chez Chez Maty : ${productUrl}`;
    document.getElementById("share-whatsapp").addEventListener("click", () => {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    });
    document.getElementById("share-facebook").addEventListener("click", () => {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(productUrl)}`, "_blank", "noopener,noreferrer");
    });
    const whatsappOrder = document.getElementById("whatsapp-order");
    whatsappOrder.href = `https://wa.me/2250709109224?text=${encodeURIComponent(`Bonjour Chez Maty, je souhaite commander : ${product.name}. ${productUrl}`)}`;
  }

  function renderProduct(product, categories) {
    currentProduct = product;
    document.title = `${product.name} — Chez Maty`;
    document.querySelector('meta[name="description"]').content = `${product.name}, cadeau personnalisé pour bébé chez Chez Maty. ${product.description.slice(0, 115)}`;
    document.getElementById("product-breadcrumb").textContent = product.name;
    document.getElementById("product-category").textContent = categories.get(product.category_id) || "Une création Chez Maty";
    document.getElementById("product-name").textContent = product.name;
    document.getElementById("product-price").textContent = api.formatPrice(product.price_xof);
    document.getElementById("product-description").textContent = product.description;
    const stock = document.getElementById("product-stock");
    if (product.description.startsWith("Prix estimatif provisoire")) {
      stock.textContent = "Prix provisoire : confirmez le tarif et la disponibilité sur WhatsApp avant de commander.";
      stock.classList.add("is-low");
    } else if (product.stock <= 0) {
      stock.textContent = "Rupture de stock — écrivez-nous pour une prochaine disponibilité.";
      stock.classList.add("is-out");
    } else if (product.stock <= 3) {
      stock.textContent = `Plus que ${product.stock} pièce${product.stock > 1 ? "s" : ""} disponible${product.stock > 1 ? "s" : ""}`;
      stock.classList.add("is-low");
    } else {
      stock.textContent = "En stock — confectionné avec soin";
    }

    renderGallery(product);
    const favoriteButton = document.getElementById("detail-favorite");
    favoriteButton.dataset.favoriteId = String(product.id);
    favoriteButton.dataset.favoriteName = product.name;
    const isFavorite = api.getFavorites().includes(String(product.id));
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.setAttribute("aria-label", `${isFavorite ? "Retirer des" : "Ajouter aux"} favoris : ${product.name}`);
    favoriteButton.querySelector("span").textContent = isFavorite ? "♥" : "♡";

    const addButton = document.getElementById("add-to-cart");
    addButton.hidden = product.description.startsWith("Prix estimatif provisoire") || product.stock <= 0;
    addButton.disabled = product.stock <= 0;
    if (product.stock <= 0) addButton.textContent = "Indisponible";
    else addButton.addEventListener("click", addProductToCart);

    nameInput.addEventListener("input", updatePreview);
    updateShareLinks(product);
    loading.hidden = true;
    detail.hidden = false;
    loadReviews(product.slug);
    loadRelated(product, categories);
  }

  function addProductToCart() {
    if (!currentProduct) return;
    const customization = {
      prenom: nameInput.value.trim(),
      couleur: document.getElementById("custom-color").value,
      message: document.getElementById("custom-message").value.trim()
    };
    if (customization.prenom.length > 30 || customization.message.length > 160) {
      api.showToast("Vérifiez la longueur du prénom ou du message.", true);
      return;
    }
    if (api.addToCart(currentProduct, 1, customization)) {
      api.showToast(`${currentProduct.name} ajouté à votre panier.`);
      const button = document.getElementById("add-to-cart");
      button.classList.remove("added");
      void button.offsetWidth;
      button.classList.add("added");
    }
  }

  async function loadReviews(productSlug) {
    const section = document.getElementById("reviews-section");
    const list = document.getElementById("reviews-list");
    const message = document.getElementById("reviews-message");
    section.hidden = false;
    try {
      const result = await api.apiFetch(`/products/${encodeURIComponent(productSlug)}/reviews`);
      if (!result.items.length) {
        document.getElementById("detail-rating").querySelector(".stars").textContent = "☆☆☆☆☆";
        message.hidden = false;
        message.textContent = "Pas encore d'avis publié. Soyez la première famille à partager votre expérience.";
        return;
      }
      const average = result.items.reduce((sum, review) => sum + review.rating, 0) / result.total;
      const ratingStars = document.getElementById("detail-rating").querySelector(".stars");
      ratingStars.textContent = `${"★".repeat(Math.round(average))}${"☆".repeat(5 - Math.round(average))}`;
      ratingStars.setAttribute("aria-label", `Note moyenne : ${average.toFixed(1)} sur 5`);
      const ratingText = document.getElementById("detail-rating").querySelector("span:last-child");
      ratingText.textContent = `${average.toFixed(1)} · ${result.total} avis`;
      list.replaceChildren();
      result.items.forEach((review) => {
        const card = document.createElement("article");
        card.className = "review-card";
        const header = document.createElement("div");
        header.className = "review-card-header";
        const customer = document.createElement("h3");
        customer.textContent = review.customer_name;
        const rating = document.createElement("span");
        rating.className = "stars";
        rating.textContent = `${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}`;
        rating.setAttribute("aria-label", `Note : ${review.rating} sur 5`);
        header.append(customer, rating);
        const comment = document.createElement("p");
        comment.textContent = review.comment;
        card.append(header, comment);
        list.append(card);
      });
      message.hidden = true;
    } catch (requestError) {
      message.hidden = false;
      message.textContent = `Les avis ne sont pas accessibles pour le moment : ${requestError.message}`;
      console.error("Erreur de chargement des avis :", requestError);
    }
  }

  async function loadRelated(product, categories) {
    const section = document.getElementById("related-section");
    const grid = document.getElementById("related-products");
    try {
      const results = await api.apiFetch("/products?limit=12&sort=newest");
      const related = results.filter((item) => item.id !== product.id).slice(0, 4);
      if (!related.length) return;
      related.forEach((item) => grid.append(api.createProductCard(item, categories.get(item.category_id))));
      section.hidden = false;
    } catch (requestError) {
      console.error("Erreur de chargement des produits similaires :", requestError);
    }
  }

  async function init() {
    if (!slug) {
      showError("Aucun produit sélectionné. Retournez au catalogue pour choisir une création.");
      return;
    }
    try {
      const [product, categories] = await Promise.all([
        api.apiFetch(`/products/${encodeURIComponent(slug)}`),
        api.apiFetch("/categories")
      ]);
      const categoryMap = new Map(categories.map((category) => [category.id, category.name]));
      renderProduct(product, categoryMap);
    } catch (requestError) {
      showError(requestError.status === 404
        ? "Cette création n’est plus disponible. Parcourez la boutique pour découvrir nos autres cadeaux."
        : `Impossible de charger cette création : ${requestError.message}`);
      console.error("Erreur de chargement du produit :", requestError);
    }
  }

  init();
}());
