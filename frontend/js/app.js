/* Fonctions communes aux pages de Chez Maty. */
(function () {
  "use strict";

  const isLocalHost = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const defaultApiUrl = isLocalHost
    ? "http://127.0.0.1:8000/api"
    : "https://chezmaty-api.onrender.com/api";
  const API_BASE = (window.CHEZ_MATY_API_URL || defaultApiUrl).replace(/\/$/, "");
  const API_ORIGIN = window.CHEZ_MATY_API_ORIGIN || new URL(API_BASE, window.location.href).origin;
  const CART_STORAGE_KEY = "chezmaty_cart_v1";
  const FAVORITES_STORAGE_KEY = "chezmaty_favorites_v1";
  const FALLBACK_IMAGE = "images/coffret.svg";
  const moneyFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  const icons = {
    heart: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>',
    cart: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h8.7a2 2 0 0 0 1.9-1.4L22 8H6"/><path d="M9 20h.01M18 20h.01"/></svg>',
    account: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/></svg>'
  };

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
    image.dataset.fallbackApplied = "false";
    image.classList.remove("image-placeholder");
    image.src = escapeImageUrl(image.src);
    image.alt = alt || "";
    image.loading = "lazy";
    image.decoding = "async";
    if (image.dataset.fallbackHandlerAttached !== "true") {
      image.addEventListener("error", () => {
        if (image.dataset.fallbackApplied === "true") return;
        image.dataset.fallbackApplied = "true";
        image.src = fallback || FALLBACK_IMAGE;
        image.classList.add("image-placeholder");
      });
      image.dataset.fallbackHandlerAttached = "true";
    }
  }

  function createProductCard(product, categoryName) {
    const article = document.createElement("article");
    article.className = "product-card";
    const productImages = Array.isArray(product.images) ? [...product.images] : [];
    productImages.sort((left, right) => left.position - right.position);
    const imageSources = productImages.length
      ? productImages.map((item) => escapeImageUrl(item.image_path))
      : [imageForProduct(product)];
    const link = document.createElement("a");
    link.className = "product-card-link";
    link.href = `produit.html?slug=${encodeURIComponent(product.slug)}`;
    link.setAttribute("aria-label", `Découvrir ${product.name}`);

    const imageWrap = document.createElement("div");
    imageWrap.className = "product-card-image";
    const image = document.createElement("img");
    image.src = imageSources[0];
    setUpImage(image, productImages[0]?.alt_text || product.name);
    const imageLink = document.createElement("a");
    imageLink.className = "product-card-image-link";
    imageLink.href = link.href;
    imageLink.setAttribute("aria-label", `Voir les photos de ${product.name}`);
    imageLink.append(image);
    imageWrap.append(imageLink);

    if (imageSources.length > 1) {
      const dots = document.createElement("div");
      dots.className = "product-image-dots";
      dots.setAttribute("aria-label", "Photos du produit");
      imageSources.forEach((source, index) => {
        const dot = document.createElement("button");
        dot.className = "image-dot";
        dot.type = "button";
        dot.setAttribute("aria-label", `Afficher la photo ${index + 1}`);
        dot.setAttribute("aria-pressed", String(index === 0));
        dot.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          image.src = source;
          setUpImage(image, productImages[index]?.alt_text || product.name);
          dots.querySelectorAll(".image-dot").forEach((item) => {
            item.setAttribute("aria-pressed", String(item === dot));
          });
        });
        dots.append(dot);
      });
      imageWrap.append(dots);
      bindImageSwipe(imageWrap, (direction) => {
        const activeIndex = [...dots.children].findIndex((dot) => dot.getAttribute("aria-pressed") === "true");
        const nextIndex = (activeIndex + direction + imageSources.length) % imageSources.length;
        dots.children[nextIndex].click();
      });
    }

    if (product.description.startsWith("Prix estimatif provisoire")) {
      const badge = document.createElement("span");
      badge.className = "product-badge";
      badge.textContent = "Prix provisoire";
      imageWrap.append(badge);
    } else if (product.stock > 0 && product.stock <= 3) {
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
    link.append(info);
    article.append(link, controls);
    article.insertBefore(imageWrap, link);
    return article;
  }

  function bindImageSwipe(element, onSwipe) {
    let startX = null;
    element.addEventListener("touchstart", (event) => {
      startX = event.changedTouches[0].clientX;
    }, { passive: true });
    element.addEventListener("touchend", (event) => {
      if (startX === null) return;
      const delta = event.changedTouches[0].clientX - startX;
      startX = null;
      if (Math.abs(delta) >= 45) onSwipe(delta < 0 ? 1 : -1);
    }, { passive: true });
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
    icon.className = "favorite-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = icons.heart;
    if (isFavorite) button.classList.add("is-favorite");
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
    updateFavoriteCount();
    button.setAttribute("aria-pressed", String(!wasFavorite));
    button.setAttribute("aria-label", `${wasFavorite ? "Ajouter aux" : "Retirer des"} favoris : ${button.dataset.favoriteName || "ce produit"}`);
    const icon = button.querySelector("span");
    if (icon) icon.innerHTML = icons.heart;
    button.classList.toggle("is-favorite", !wasFavorite);
    showToast(wasFavorite ? "Produit retiré de vos favoris." : "Produit ajouté à vos favoris.");

    if (document.cookie.includes("access_token=") && getCsrfToken()) {
      const method = wasFavorite ? "DELETE" : "PUT";
      apiFetch(`/favorites/${encodeURIComponent(id)}`, {
        method,
        headers: { "X-CSRF-Token": getCsrfToken() }
      }).catch((error) => {
        const rollback = wasFavorite ? [...next, id] : next.filter((favoriteId) => favoriteId !== id);
        writeStorage(FAVORITES_STORAGE_KEY, rollback);
        updateFavoriteCount();
        button.setAttribute("aria-pressed", String(wasFavorite));
        if (icon) icon.innerHTML = icons.heart;
        button.classList.toggle("is-favorite", wasFavorite);
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
    favoriteIcon.className = "header-icon";
    favoriteIcon.setAttribute("aria-hidden", "true");
    favoriteIcon.innerHTML = icons.heart;
    const favoriteLabel = document.createElement("span");
    favoriteLabel.className = "header-action-label";
    favoriteLabel.textContent = "Favoris";
    const favoriteCount = document.createElement("span");
    favoriteCount.className = "cart-count favorite-count";
    favoriteCount.dataset.favoriteCount = "";
    favoriteCount.textContent = "0";
    favoriteLink.append(favoriteIcon, favoriteLabel, favoriteCount);
    const cartLink = document.createElement("a");
    cartLink.className = "header-action";
    cartLink.href = "panier.html";
    cartLink.setAttribute("aria-label", "Voir le panier");
    const cartIcon = document.createElement("span");
    cartIcon.className = "header-icon";
    cartIcon.setAttribute("aria-hidden", "true");
    cartIcon.innerHTML = icons.cart;
    const cartLabel = document.createElement("span");
    cartLabel.className = "header-action-label";
    cartLabel.textContent = "Panier";
    const cartCount = document.createElement("span");
    cartCount.className = "cart-count";
    cartCount.dataset.cartCount = "";
    cartCount.textContent = "0";
    cartLink.append(cartIcon, cartLabel, cartCount);
    const accountWrap = document.createElement("div");
    accountWrap.className = "account-menu-wrap";
    const accountLink = document.createElement("button");
    accountLink.className = "header-action account-action";
    accountLink.type = "button";
    accountLink.dataset.accountToggle = "";
    accountLink.setAttribute("aria-label", "Ouvrir le menu du compte");
    accountLink.setAttribute("aria-expanded", "false");
    accountLink.setAttribute("aria-controls", "account-menu");
    const accountIcon = document.createElement("span");
    accountIcon.className = "header-icon";
    accountIcon.setAttribute("aria-hidden", "true");
    accountIcon.innerHTML = icons.account;
    const accountLabel = document.createElement("span");
    accountLabel.className = "header-action-label";
    accountLabel.textContent = "Compte";
    accountLink.append(accountIcon, accountLabel);
    const accountMenu = document.createElement("div");
    accountMenu.className = "account-menu";
    accountMenu.id = "account-menu";
    accountMenu.hidden = true;
    accountMenu.innerHTML = `
      <a class="account-menu-profile" href="compte.html">Mon compte</a>
      <a class="account-menu-signin" href="compte.html">Se connecter</a>
      <a class="account-menu-register" href="compte.html#creer-compte">Créer un compte</a>
      <button class="account-menu-logout" type="button" hidden>Se déconnecter</button>
      <p class="account-menu-error" role="status" hidden></p>`;
    accountWrap.append(accountLink, accountMenu);
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
    actions.append(favoriteLink, cartLink, accountWrap, menuButton);
    header.replaceChildren(brand, nav, actions);
    updateFavoriteCount();
    updateAccountMenu();
  }

  function updateFavoriteCount() {
    const total = getFavorites().length;
    document.querySelectorAll("[data-favorite-count]").forEach((element) => {
      element.textContent = String(total);
      element.setAttribute("aria-label", `${total} favori${total === 1 ? "" : "s"}`);
    });
  }

  async function updateAccountMenu() {
    const menu = document.getElementById("account-menu");
    if (!menu) return;
    const signIn = menu.querySelector(".account-menu-signin");
    const register = menu.querySelector(".account-menu-register");
    const profile = menu.querySelector(".account-menu-profile");
    const logout = menu.querySelector(".account-menu-logout");
    const errorMessage = menu.querySelector(".account-menu-error");
    try {
      const user = await apiFetch("/auth/me");
      profile.textContent = user.full_name ? `Bonjour ${user.full_name}` : "Mon compte";
      signIn.hidden = true;
      register.hidden = true;
      logout.hidden = false;
    } catch (error) {
      if (error.status === 401) {
        signIn.hidden = false;
        register.hidden = false;
        logout.hidden = true;
        return;
      }
      errorMessage.hidden = false;
      errorMessage.textContent = "Impossible de vérifier votre session. Réessayez depuis Mon compte.";
      console.error("Erreur de vérification de session :", error);
    }
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
      <div class="footer-bottom">© <span data-current-year></span> Chez Maty · Côte d’Ivoire · Livraison dans les zones couvertes.</div>`;
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
      const accountToggle = target.closest("[data-account-toggle]");
      if (accountToggle) {
        const menu = document.getElementById("account-menu");
        if (!menu) return;
        const isOpen = accountToggle.getAttribute("aria-expanded") === "true";
        accountToggle.setAttribute("aria-expanded", String(!isOpen));
        menu.hidden = isOpen;
        return;
      }
      const logoutButton = target.closest(".account-menu-logout");
      if (logoutButton) {
        logoutButton.disabled = true;
        const errorMessage = document.querySelector(".account-menu-error");
        if (errorMessage) errorMessage.hidden = true;
        apiFetch("/auth/logout", {
          method: "POST",
          headers: { "X-CSRF-Token": getCsrfToken() }
        }).then(() => {
          window.location.assign("compte.html");
        }).catch((error) => {
          if (errorMessage) {
            errorMessage.hidden = false;
            errorMessage.textContent = `La déconnexion a échoué : ${error.message}`;
          }
          logoutButton.disabled = false;
        });
        return;
      }
      if (!target.closest(".account-menu-wrap")) {
        const accountMenu = document.getElementById("account-menu");
        const accountButton = document.querySelector("[data-account-toggle]");
        if (accountMenu && accountButton) {
          accountMenu.hidden = true;
          accountButton.setAttribute("aria-expanded", "false");
        }
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
      if (event.key === FAVORITES_STORAGE_KEY) updateFavoriteCount();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      const accountMenu = document.getElementById("account-menu");
      const accountButton = document.querySelector("[data-account-toggle]");
      if (accountMenu && accountButton && !accountMenu.hidden) {
        accountMenu.hidden = true;
        accountButton.setAttribute("aria-expanded", "false");
        accountButton.focus();
      }
    });
  }

  function initCommon() {
    createHeader();
    createFooter();
    setUpTheme();
    setUpMotion();
    bindCommonEvents();
    updateCartCount();
    updateFavoriteCount();
  }

  window.ChezMaty = {
    API_BASE,
    FALLBACK_IMAGE,
    addToCart,
    apiFetch,
    bindImageSwipe,
    createFavoriteButton,
    createProductCard,
    favoriteIcon: () => icons.heart,
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
