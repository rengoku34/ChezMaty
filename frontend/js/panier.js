/* Panier local persistant et validation d'une commande via l'API. */
(function () {
  "use strict";

  const api = window.ChezMaty;
  if (!api) return;

  const lineContainer = document.getElementById("cart-lines");
  const subtotal = document.getElementById("cart-subtotal");
  const checkoutButton = document.getElementById("checkout-button");
  const checkoutLogin = document.getElementById("checkout-login");
  const checkoutSection = document.getElementById("checkout-address-section");
  const checkoutMessage = document.getElementById("checkout-message");
  const syncStatus = document.getElementById("cart-sync-status");
  let customer = null;
  let addresses = [];
  let isSyncing = false;

  function textMessage(message, isError) {
    checkoutMessage.hidden = false;
    checkoutMessage.classList.toggle("error-text", Boolean(isError));
    checkoutMessage.textContent = message;
  }

  function productPhoto(item) {
    if (item.image) return api.resolveImageUrl(item.image);
    return api.resolveImageUrl(api.FALLBACK_IMAGE);
  }

  function renderCart(totalOverride) {
    const items = api.getCart();
    lineContainer.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state cart-empty";
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "♡";
      const title = document.createElement("h2");
      title.textContent = "Votre panier est tout doux et tout vide";
      const copy = document.createElement("p");
      copy.textContent = "Parcourez les créations et ajoutez vos petits coups de cœur.";
      const link = document.createElement("a");
      link.className = "button button-primary";
      link.href = "catalogue.html";
      link.textContent = "Découvrir la boutique";
      empty.append(icon, title, copy, link);
      lineContainer.append(empty);
      subtotal.textContent = api.formatPrice(0);
      checkoutButton.disabled = true;
      checkoutLogin.hidden = !customer || items.length === 0;
      return;
    }

    items.forEach((item, index) => {
      const card = document.createElement("article");
      card.className = "cart-line";
      const image = document.createElement("img");
      image.className = "cart-line-image";
      image.src = productPhoto(item);
      image.alt = item.name;
      api.setUpImage(image, item.name);
      const body = document.createElement("div");
      body.className = "cart-line-body";
      const heading = document.createElement("div");
      heading.className = "cart-line-heading";
      const title = document.createElement("h2");
      title.textContent = item.name;
      const remove = document.createElement("button");
      remove.className = "text-link danger-link";
      remove.type = "button";
      remove.dataset.removeIndex = String(index);
      remove.textContent = "Retirer";
      heading.append(title, remove);
      const options = Object.entries(item.customization || {}).filter(([, value]) => value);
      const detail = document.createElement("p");
      detail.className = "cart-line-customization";
      detail.textContent = options.length
        ? options.map(([key, value]) => `${key === "prenom" ? "Prénom" : key === "couleur" ? "Couleur" : "Message"} : ${value}`).join(" · ")
        : "Sans personnalisation";
      const footer = document.createElement("div");
      footer.className = "cart-line-footer";
      const quantityLabel = document.createElement("label");
      quantityLabel.className = "quantity-control";
      const label = document.createElement("span");
      label.textContent = "Quantité";
      const quantity = document.createElement("input");
      quantity.type = "number";
      quantity.min = "1";
      quantity.max = "99";
      quantity.value = String(item.quantity);
      quantity.dataset.quantityIndex = String(index);
      quantity.setAttribute("aria-label", `Quantité pour ${item.name}`);
      quantityLabel.append(label, quantity);
      const price = document.createElement("strong");
      price.className = "cart-line-price";
      price.textContent = api.formatPrice(Number(item.price_xof) * Number(item.quantity));
      footer.append(quantityLabel, price);
      body.append(heading, detail, footer);
      card.append(image, body);
      lineContainer.append(card);
    });
    const computedTotal = items.reduce((total, item) => total + Number(item.price_xof) * Number(item.quantity), 0);
    subtotal.textContent = api.formatPrice(totalOverride === undefined ? computedTotal : totalOverride);
    checkoutButton.disabled = isSyncing || !customer;
    checkoutLogin.hidden = Boolean(customer);
    checkoutSection.hidden = !customer;
  }

  async function synchronizeCart() {
    if (!customer) return null;
    const localItems = api.getCart();
    const server = await api.apiFetch("/cart");
    const merged = [...server.items.map((item) => ({
      product_id: item.product_id,
      slug: item.slug,
      name: item.name,
      price_xof: item.price_xof,
      quantity: item.quantity,
      image: item.image_path || "",
      customization: item.customization
    }))];
    localItems.forEach((item) => {
      const same = merged.find((serverItem) => serverItem.product_id === Number(item.product_id)
        && JSON.stringify(serverItem.customization || {}) === JSON.stringify(item.customization || {}));
      if (same) same.quantity = Math.max(same.quantity, Number(item.quantity));
      else merged.push(item);
    });
    isSyncing = true;
    checkoutButton.disabled = true;
    try {
      const result = await api.apiFetch("/cart", {
        method: "PUT",
        headers: { "X-CSRF-Token": api.getCsrfToken() },
        body: JSON.stringify({
          items: merged.map((item) => ({
            product_id: Number(item.product_id),
            quantity: Number(item.quantity),
            customization: item.customization || {}
          }))
        })
      });
      const syncedItems = result.items.map((item) => ({
        product_id: item.product_id,
        slug: item.slug,
        name: item.name,
        price_xof: item.price_xof,
        quantity: item.quantity,
        image: item.image_path || merged.find((line) => Number(line.product_id) === item.product_id
          && JSON.stringify(line.customization || {}) === JSON.stringify(item.customization || {}))?.image || "",
        customization: item.customization
      }));
      api.setCart(syncedItems);
      syncStatus.textContent = "Panier synchronisé et prix vérifiés par Chez Maty.";
      checkoutMessage.hidden = true;
      renderCart(result.total_xof);
      return result;
    } finally {
      isSyncing = false;
      checkoutButton.disabled = !customer || api.getCart().length === 0;
    }
  }

  async function loadAddresses() {
    const select = document.getElementById("checkout-address");
    try {
      addresses = await api.apiFetch("/addresses");
      select.replaceChildren();
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Choisir une adresse";
      select.append(placeholder);
      addresses.forEach((address) => {
        const option = document.createElement("option");
        option.value = String(address.id);
        option.textContent = `${address.recipient_name} · ${address.commune}, ${address.city}${address.is_default ? " · principale" : ""}`;
        if (address.is_default) option.selected = true;
        select.append(option);
      });
      document.getElementById("delivery-zone-help").textContent = addresses.length
        ? "La couverture de la commune sera confirmée avant l'enregistrement."
        : "Ajoutez d'abord une adresse dans votre compte pour continuer.";
    } catch (error) {
      textMessage(`Impossible de charger les adresses : ${error.message}`, true);
    }
  }

  function updateLocalQuantity(index, value) {
    const cart = api.getCart();
    const item = cart[index];
    if (!item) return;
    const quantity = Math.max(1, Math.min(99, Number(value) || 1));
    item.quantity = quantity;
    api.setCart(cart);
    renderCart();
    if (customer) {
      synchronizeCart().catch((error) => {
        textMessage(error.message || "Le stock demandé n'est pas disponible.", true);
        renderCart();
      });
    }
  }

  async function createOrder() {
    checkoutMessage.hidden = true;
    const addressId = document.getElementById("checkout-address").value;
    if (!addressId) {
      textMessage("Choisissez une adresse de livraison pour continuer.", true);
      return;
    }
    checkoutButton.disabled = true;
    checkoutButton.textContent = "Vérification de votre commande…";
    try {
      await synchronizeCart();
      const order = await api.apiFetch("/orders", {
        method: "POST",
        headers: { "X-CSRF-Token": api.getCsrfToken() },
        body: JSON.stringify({ address_id: Number(addressId) })
      });
      api.setCart([]);
      renderCart(0);
      document.querySelector(".cart-layout").hidden = true;
      const success = document.getElementById("order-success");
      success.hidden = false;
      document.getElementById("order-success-details").textContent = `Votre commande ${order.order_number} d’un montant de ${api.formatPrice(order.total_xof)} est enregistrée.`;
      window.scrollTo({ top: success.offsetTop - 95, behavior: "smooth" });
    } catch (error) {
      textMessage(error.message || "La commande n'a pas pu être créée.", true);
      checkoutButton.disabled = false;
    } finally {
      checkoutButton.textContent = "Continuer ma commande";
    }
  }

  lineContainer.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement) || !target.dataset.quantityIndex) return;
    updateLocalQuantity(Number(target.dataset.quantityIndex), target.value);
  });
  lineContainer.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const removeButton = target?.closest("[data-remove-index]");
    if (!removeButton) return;
    const cart = api.getCart();
    cart.splice(Number(removeButton.dataset.removeIndex), 1);
    api.setCart(cart);
    renderCart();
    if (customer) {
      synchronizeCart().catch((error) => textMessage(error.message, true));
    }
  });
  checkoutButton.addEventListener("click", createOrder);

  async function init() {
    renderCart();
    try {
      customer = await api.apiFetch("/auth/me");
      checkoutLogin.hidden = true;
      checkoutSection.hidden = false;
      await loadAddresses();
      await synchronizeCart();
    } catch (error) {
      if (error.status === 401) {
        customer = null;
        checkoutSection.hidden = true;
        checkoutLogin.hidden = api.getCart().length === 0;
        syncStatus.textContent = "Connectez-vous pour synchroniser et confirmer votre commande.";
        renderCart();
        return;
      }
      textMessage(`Impossible de vérifier votre compte : ${error.message}`, true);
    }
  }

  init();
}());
