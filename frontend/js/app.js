/* Fonctions communes aux pages de Chez Maty. */
(function () {
  "use strict";

  const API_BASE = (window.CHEZ_MATY_API_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
  const API_ORIGIN = window.CHEZ_MATY_API_ORIGIN || new URL(API_BASE, window.location.href).origin;
  const CART_STORAGE_KEY = "chezmaty_cart_v1";
  const FAVORITES_STORAGE_KEY = "chezmaty_favorites_v1";
  const FALLBACK_IMAGE = "images/coffret.svg";
  const moneyFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

  function escapeImageUrl(value) {
    if (!value) return FALLBACK_IMAGE;
    const raw = String(value).trim();
    if (/^(https?:\/\/|data:)/i.test(raw)) return raw;
    const apiOrigin = API_ORIGIN;
    if (raw.startsWith("/")) return `${apiOrigin}${raw}`;
    if (raw.startsWith("uploads/")) return `${apiOrigin}/${raw}`;
    if (raw.startsWith("backend/uploads/")) return `${apiOrigin}/${raw.slice("backend/".length)}`;
    return raw.replace(/^\.?\//, "");
  }

  async function apiFetch(path, options) {
    const requestOptions = Object.assign({ credentials: "include" }, options || {});
    requestOptions.headers = new Headers(requestOptions.headers || {});
    if (requestOptions.body && !(requestOptions.body instanceof FormData)) {
      requestOptions.headers.set("Content-Type", "application/json");
    }
    const response = await fetch(`${API_BASE}${path}`, requestOptions);
    if (!response.ok) {
      let message = `La requête a échoué (${response.status}).`;
      try {
        const body = await response.json();
        if (typeof body.detail === "string") message = body.detail;
        else if (Array.isArray(body.detail)) message = body.detail.map((item) => item.msg).join(" ");
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
      const apiError = new Error(message);
      apiError.status = response.status;
      throw apiError;
    }
    if (response.status === 204) return null;
    return response.json();
  }

  function readStorage(key, defaultValue) {
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    } catch (error) {
      console.error("Impossible de lire les préférences locales.", error);
      return defaultValue;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error("Impossible d'enregistrer les préférences locales.", error);
      showToast("Le stockage du navigateur est indisponible. Réessayez après avoir libéré de l'espace.", true);
      return false;
    }
  }

  function getCart() {
    const cart = readStorage(CART_STORAGE_KEY, []);
    return Array.isArray(cart) ? cart : [];
  }

  function setCart(cart) {
    if (!Array.isArray(cart) || !writeStorage(CART_STORAGE_KEY, cart)) return false;
    updateCartCount();
    return true;
  }

  function getFavorites() {
    const favorites = readStorage(FAVORITES_STORAGE_KEY, []);
    return Array.isArray(favorites) ? favorites.map(String) : [];
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : "";
  }

  function formatPrice(price) {
    return `${moneyFormatter.format(Number(price) || 0)} FCFA`;
  }

  function showToast(message, isError) {
    const region = document.getElementById("toast-region");
    if (!region) return;
    const toast = document.createElement("div");
    toast.className = `toast${isError ? " toast-error" : ""}`;
    toast.setAttribute("role", isError ? "alert" : "status");
    toast.textContent = message;
    region.append(toast);
    window.setTimeout(() => toast.remove(), 3900);
  }

  function imageForProduct(product) {
    const images = Array.isArray(product.images) ? [...product.images] : [];
    images.sort((left, right) => left.position - right.position);
    if (images.length) return escapeImageUrl(images[0].image_path);
    const label = `${product.name || ""} ${product.category_name || ""}`.toLocaleLowerCase("fr");
    if (/t[eé]tine|attache|sucette/.test(label)) return "images/tetine-personnalisee-rose.jpeg";
    if (/g[aâ]teau|couche|ballon/.test(label)) return "images/gateau-couches-bleu.jpeg";
    if (/welcome|naissance|coffret/.test(label)) return "images/coffret-welcome-baby-rose.jpeg";
    return "images/coffret-naissance-prince.jpeg";
  }

  function setUpImage(image, alt, fallback) {
    image.src = escapeImageUrl(image.src);
    image.alt = alt || "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      if (image.dataset.fallbackApplied === "true") return;
      image.dataset.fallbackApplied = "true";
      image.src = fallback || FALLBACK_IMAGE;
      image.classList.add("image-placeholder");
    });
  }

  function createProductCard(product, categoryName) {
    const article = document.createElement("article");
    article.className = "product-card";
    const link = document.createElement("a");
    link.className = "product-card-link";
    link.href = `produit.html?slug=${encodeURIComponent(product.slug)}`;
    link.setAttribute("aria-label", `Découvrir ${product.name}`);

    const imageWrap = document.createElement("div");
    imageWrap.className = "product-card-image";
    const image = document.createElement("img");
    image.src = imageForProduct(product);
    setUpImage(image, product.name);
    imageWrap.append(image);

    if (product.stock > 0 && product.stock <= 3) {
      const badge = document.createElement("span");
      badge.className = "product-badge";
      badge.textContent = "Dernières pièces";
      imageWrap.append(badge);
    } else if (product.is_featured) {
      const badge = document.createElement("span");
      badge.className = "product-badge";
      badge.textContent = "Coup de cœur";
      imageWrap.append(badge);
    }

    const info = document.createElement("div");
    info.className = "product-card-info";
    const title = document.createElement("h3");
    title.textContent = product.name;
    const meta = document.createElement("div");
    meta.className = "product-card-meta";
    const category = document.createElement("span");
    category.className = "product-card-category";
    category.textContent = categoryName || "Création personnalisée";
    const price = document.createElement("span");
    price.className = "product-price";
    price.textContent = formatPrice(product.price_xof);
    meta.append(category, price);

    const controls = document.createElement("div");
    controls.className = "product-card-controls";
    const addButton = document.createElement("button");
    addButton.className = "card-add-button";
    addButton.type = "button";
    addButton.dataset.addProduct = String(product.id);
    addButton.dataset.productSlug = product.slug;
    addButton.dataset.productName = product.name;
    addButton.dataset.productPrice = String(product.price_xof);
    addButton.setAttribute("aria-label", `Ajouter ${product.name} au panier`);
    addButton.textContent = product.stock > 0 ? "Ajouter au panier" : "Indisponible";
    addButton.disabled = product.stock <= 0;
    const favoriteButton = createFavoriteButton(product.id, product.name);
    controls.append(addButton, favoriteButton);
    info.append(title, meta);
    link.append(imageWrap, info);
    article.append(link, controls);
    return article;
  }

  function createFavoriteButton(productId, productName) {
    const button = document.createElement("button");
    button.className = "icon-button favorite-button";
    button.type = "button";
    button.dataset.favoriteId = String(productId);
    button.dataset.favoriteName = productName;
    const isFavorite = getFavorites().includes(String(productId));
    button.setAttribute("aria-pressed", String(isFavorite));
    button.setAttribute("aria-label", `${isFavorite ? "Retirer des" : "Ajouter aux"} favoris : ${productName}`);
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isFavorite ? "♥" : "♡";
    button.append(icon);
    return button;
  }

  function addToCart(product, quantity, customization) {
    const cart = getCart();
    const safeQuantity = Math.max(1, Math.min(99, Number(quantity) || 1));
    const details = customization || {};
    const existing = cart.find((item) => item.product_id === Number(product.id)
      && JSON.stringify(item.customization || {}) === JSON.stringify(details));
    if (existing) {
      existing.quantity = Math.min(99, existing.quantity + safeQuantity);
    } else {
      cart.push({
        product_id: Number(product.id),
        slug: String(product.slug),
        name: String(product.name),
        price_xof: Number(product.price_xof),
        quantity: safeQuantity,
        image: imageForProduct(product),
        customization: details
      });
    }
    if (!writeStorage(CART_STORAGE_KEY, cart)) return false;
    updateCartCount();
    return true;
  }

  function updateCartCount() {
    const total = getCart().reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0), 0);
    document.querySelectorAll("[data-cart-count]").forEach((element) => {
      element.textContent = String(total);
      element.setAttribute("aria-label", `${total} article${total === 1 ? "" : "s"} dans le panier`);
    });
    return total;
  }

  function toggleFavorite(button) {
    const id = String(button.dataset.favoriteId || "");
    const favorites = getFavorites();
    const wasFavorite = favorites.includes(id);
    const next = wasFavorite ? favorites.filter((favoriteId) => favoriteId !== id) : [...favorites, id];
    if (!writeStorage(FAVORITES_STORAGE_KEY, next)) return;
    button.setAttribute("aria-pressed", String(!wasFavorite));
    button.setAttribute("aria-label", `${wasFavorite ? "Ajouter aux" : "Retirer des"} favoris : ${button.dataset.favoriteName || "ce produit"}`);
    const icon = button.querySelector("span");
    if (icon) icon.textContent = wasFavorite ? "♡" : "♥";
    showToast(wasFavorite ? "Produit retiré de vos favoris." : "Produit ajouté à vos favoris.");

    if (document.cookie.includes("access_token=") && getCsrfToken()) {
      const method = wasFavorite ? "DELETE" : "PUT";
      apiFetch(`/favorites/${encodeURIComponent(id)}`, {
        method,
        headers: { "X-CSRF-Token": getCsrfToken() }
      }).catch((error) => {
        const rollback = wasFavorite ? [...next, id] : next.filter((favoriteId) => favoriteId !== id);
        writeStorage(FAVORITES_STORAGE_KEY, rollback);
        button.setAttribute("aria-pressed", String(wasFavorite));
        if (icon) icon.textContent = wasFavorite ? "♥" : "♡";
        showToast(error.message || "Impossible de synchroniser les favoris.", true);
      });
    } else {
      showToast("Vos favoris sont gardés sur cet appareil. Connectez-vous pour les synchroniser.");
    }
  }

  function createHeader() {
    const header = document.getElementById("site-header");
    if (!header) return;
    const currentPage = document.body.dataset.page;
    const nav = document.createElement("nav");
    nav.className = "main-nav";
    nav.id = "main-nav";
    nav.setAttribute("aria-label", "Navigation principale");
    [
      { label: "Accueil", href: "index.html", page: "home" },
      { label: "La boutique", href: "catalogue.html", page: "catalogue" },
      { label: "Nos créations", href: "catalogue.html?sort=newest", page: "produit" },
      { label: "Mon compte", href: "compte.html", page: "compte" },
      { label: "Mon panier", href: "panier.html", page: "panier" },
      { label: "Nous écrire", href: "https://wa.me/2250709109224", external: true }
    ].forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.label;
      if (item.page === currentPage) link.setAttribute("aria-current", "page");
      if (item.external) {
        link.target = "_blank";
        link.rel = "noopener noreferrer";
      }
      nav.append(link);
    });

    const brand = document.createElement("a");
    brand.className = "brand";
    brand.href = "index.html";
    brand.setAttribute("aria-label", "Chez Maty, accueil");
    const logo = document.createElement("img");
    logo.className = "brand-logo";
    logo.src = "images/logo-chez-maty.png";
    logo.alt = "Chez Maty";
    logo.width = 58;
    logo.height = 58;
    brand.append(logo);

    const actions = document.createElement("div");
    actions.className = "header-actions";
    const favoriteLink = document.createElement("button");
    favoriteLink.className = "header-action";
    favoriteLink.type = "button";
    favoriteLink.dataset.headerFavorites = "";
    favoriteLink.setAttribute("aria-label", "Voir les favoris enregistrés sur cet appareil");
    const favoriteIcon = document.createElement("span");
    favoriteIcon.setAttribute("aria-hidden", "true");
    favoriteIcon.textContent = "♡";
    const favoriteLabel = document.createElement("span");
    favoriteLabel.className = "header-action-label";
    favoriteLabel.textContent = "Favoris";
    favoriteLink.append(favoriteIcon, favoriteLabel);
    const cartLink = document.createElement("a");
    cartLink.className = "header-action";
    cartLink.href = "panier.html";
    cartLink.setAttribute("aria-label", "Voir le panier");
    const cartIcon = document.createElement("span");
    cartIcon.setAttribute("aria-hidden", "true");
    cartIcon.textContent = "♧";
    const cartLabel = document.createElement("span");
    cartLabel.className = "header-action-label";
    cartLabel.textContent = "Panier";
    const cartCount = document.createElement("span");
    cartCount.className = "cart-count";
    cartCount.dataset.cartCount = "";
    cartCount.textContent = "0";
    cartLink.append(cartIcon, cartLabel, cartCount);
    const accountLink = document.createElement("a");
    accountLink.className = "header-action account-action";
    accountLink.href = "compte.html";
    accountLink.setAttribute("aria-label", "Mon compte client");
    const accountIcon = document.createElement("span");
    accountIcon.setAttribute("aria-hidden", "true");
    accountIcon.textContent = "☺";
    const accountLabel = document.createElement("span");
    accountLabel.className = "header-action-label";
    accountLabel.textContent = "Mon compte";
    accountLink.append(accountIcon, accountLabel);
    const menuButton = document.createElement("button");
    menuButton.className = "header-action menu-toggle";
    menuButton.type = "button";
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-controls", "main-nav");
    menuButton.setAttribute("aria-label", "Ouvrir le menu");
    const menuIcon = document.createElement("span");
    menuIcon.setAttribute("aria-hidden", "true");
    menuIcon.textContent = "☰";
    menuButton.append(menuIcon);
    actions.append(favoriteLink, cartLink, accountLink, menuButton);
    header.replaceChildren(brand, nav, actions);
  }

  function createFooter() {
    const footer = document.getElementById("site-footer");
    if (!footer) return;
    footer.innerHTML = `
      <div class="footer-inner">
        <div class="footer-intro">
          <a class="brand footer-brand" href="index.html" aria-label="Chez Maty, accueil"><img class="brand-logo" src="images/logo-chez-maty.png" alt="Chez Maty" width="62" height="62"></a>
          <p class="footer-copy">Tout pour vos petits trésors. Des créations personnalisées imaginées avec amour pour les plus beaux moments.</p>
        </div>
        <div class="footer-column"><h2>La boutique</h2><a href="catalogue.html">Tous nos cadeaux</a><a href="catalogue.html?sort=newest">Les nouveautés</a><a href="https://wa.me/2250709109224" target="_blank" rel="noopener noreferrer">Commander sur WhatsApp</a></div>
        <div class="footer-column"><h2>Restons en contact</h2><a href="https://wa.me/2250709109224" target="_blank" rel="noopener noreferrer">WhatsApp : 07 09 10 92 24</a><a href="https://www.instagram.com/chez_maty/" target="_blank" rel="noopener noreferrer">Instagram : @chez_maty</a><a href="https://www.facebook.com/" target="_blank" rel="noopener noreferrer">Facebook : Chez Maty</a><button class="theme-toggle text-link" type="button" data-theme-toggle aria-pressed="false">Passer au thème sombre</button></div>
      </div>
      <div class="footer-bottom">© <span data-current-year></span> Chez Maty · Côte d’Ivoire · Livraison en 24 h dans les zones couvertes.</div>`;
    const year = footer.querySelector("[data-current-year]");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  function setUpTheme() {
    const savedTheme = readStorage("chezmaty_theme_v1", "light");
    if (savedTheme === "dark") document.body.classList.add("dark-mode");
    updateThemeButton();
  }

  function updateThemeButton() {
    const button = document.querySelector("[data-theme-toggle]");
    if (!button) return;
    const isDark = document.body.classList.contains("dark-mode");
    button.textContent = isDark ? "Passer au thème clair" : "Passer au thème sombre";
    button.setAttribute("aria-pressed", String(isDark));
  }

  function setUpMotion() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    document.documentElement.classList.add("js-motion");
    const items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }
    const observer = new IntersectionObserver((entries, currentObserver) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        }
      });
    }, { threshold: .12 });
    items.forEach((item) => observer.observe(item));
  }

  function bindCommonEvents() {
    document.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const favorite = target.closest("[data-favorite-id]");
      if (favorite) {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(favorite);
        return;
      }
      if (target.closest("[data-header-favorites]")) {
        const count = getFavorites().length;
        showToast(count ? `${count} favori${count === 1 ? "" : "s"} enregistré${count === 1 ? "" : "s"} sur cet appareil.` : "Vos favoris apparaîtront ici.");
        return;
      }
      if (target.closest("[data-theme-toggle]")) {
        const isDark = document.body.classList.toggle("dark-mode");
        writeStorage("chezmaty_theme_v1", isDark ? "dark" : "light");
        updateThemeButton();
        return;
      }
      const menuButton = target.closest(".menu-toggle");
      if (menuButton) {
        const nav = document.getElementById("main-nav");
        if (!nav) return;
        const isOpen = menuButton.getAttribute("aria-expanded") === "true";
        menuButton.setAttribute("aria-expanded", String(!isOpen));
        menuButton.setAttribute("aria-label", isOpen ? "Ouvrir le menu" : "Fermer le menu");
        nav.classList.toggle("is-open", !isOpen);
        return;
      }
      const addButton = target.closest("[data-add-product]");
      if (addButton) {
        event.preventDefault();
        const card = addButton.closest(".product-card");
        const product = {
          id: addButton.dataset.addProduct,
          slug: addButton.dataset.productSlug,
          name: addButton.dataset.productName,
          price_xof: addButton.dataset.productPrice,
          images: card ? [{ image_path: card.querySelector("img")?.src || FALLBACK_IMAGE, position: 0 }] : []
        };
        if (addToCart(product, 1, {})) showToast(`${product.name} ajouté à votre panier. Ouvrez le panier pour préparer votre commande.`);
      }
    });

    window.addEventListener("storage", (event) => {
      if (event.key === CART_STORAGE_KEY) updateCartCount();
    });
  }

  function initCommon() {
    createHeader();
    createFooter();
    setUpTheme();
    setUpMotion();
    bindCommonEvents();
    updateCartCount();
  }

  window.ChezMaty = {
    API_BASE,
    FALLBACK_IMAGE,
    addToCart,
    apiFetch,
    createFavoriteButton,
    createProductCard,
    formatPrice,
    getCart,
    getCsrfToken,
    getFavorites,
    imageForProduct,
    resolveImageUrl: escapeImageUrl,
    setCart,
    setUpImage,
    showToast
  };

  initCommon();
}());
