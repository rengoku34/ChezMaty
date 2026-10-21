/* Connexion, profil, adresses et commandes du client. */
(function () {
  "use strict";

  const api = window.ChezMaty;
  if (!api) return;

  const authSection = document.getElementById("auth-section");
  const dashboard = document.getElementById("customer-dashboard");
  const accountMessage = document.getElementById("account-message");
  const nextPage = new URLSearchParams(window.location.search).get("next");
  let currentUser = null;
  let addresses = [];

  function showAccountMessage(message, isError) {
    accountMessage.hidden = false;
    accountMessage.textContent = message;
    accountMessage.classList.toggle("error-text", Boolean(isError));
  }

  function showFormError(id, message) {
    const error = document.getElementById(id);
    error.hidden = false;
    error.textContent = message;
  }

  function clearFormError(id) {
    const error = document.getElementById(id);
    error.hidden = true;
    error.textContent = "";
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form).entries());
  }

  function showAuthForm(mode) {
    const isLogin = mode === "login";
    document.getElementById("login-form").hidden = !isLogin;
    document.getElementById("register-form").hidden = isLogin;
    document.getElementById("forgot-password-form").hidden = true;
    document.querySelector(".social-auth").hidden = false;
    document.getElementById(isLogin ? "login-email" : "register-name").focus();
  }

  function afterAuthentication() {
    if (nextPage === "panier.html") {
      window.location.assign("panier.html");
      return;
    }
    window.location.hash = "profile-form";
  }

  async function submitAuthentication(form, endpoint, errorId) {
    clearFormError(errorId);
    const payload = formValues(form);
    if (payload.phone !== undefined) payload.phone = payload.phone.trim() || null;
    try {
      const result = await api.apiFetch(`/auth/${endpoint}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      currentUser = result.user;
      form.reset();
      await showDashboard();
      showAccountMessage(result.message, false);
      afterAuthentication();
    } catch (error) {
      showFormError(errorId, error.message || "Impossible de vous connecter pour le moment.");
    }
  }

  function setPreferenceCheckboxes(user) {
    document.getElementById("email-notifications").checked = user.email_notifications_enabled;
    document.getElementById("push-notifications").checked = user.push_notifications_enabled;
  }

  async function loadAddresses() {
    const list = document.getElementById("address-list");
    try {
      addresses = await api.apiFetch("/addresses");
      list.replaceChildren();
      if (!addresses.length) {
        const empty = document.createElement("p");
        empty.className = "form-help";
        empty.textContent = "Aucune adresse enregistrée. Ajoutez-en une pour préparer votre prochaine commande.";
        list.append(empty);
        return addresses;
      }
      addresses.forEach((address) => {
        const card = document.createElement("article");
        card.className = "address-card";
        const title = document.createElement("div");
        title.className = "address-card-title";
        const name = document.createElement("strong");
        name.textContent = address.recipient_name;
        title.append(name);
        if (address.is_default) {
          const badge = document.createElement("span");
          badge.className = "address-badge";
          badge.textContent = "Principale";
          title.append(badge);
        }
        const location = document.createElement("p");
        location.textContent = `${address.commune}, ${address.city} · ${address.phone}`;
        const details = document.createElement("p");
        details.textContent = address.details;
        const actions = document.createElement("div");
        actions.className = "address-actions";
        const edit = document.createElement("button");
        edit.className = "text-link";
        edit.type = "button";
        edit.textContent = "Modifier";
        edit.addEventListener("click", () => editAddress(address));
        const remove = document.createElement("button");
        remove.className = "text-link danger-link";
        remove.type = "button";
        remove.textContent = "Supprimer";
        remove.addEventListener("click", () => removeAddress(address));
        actions.append(edit, remove);
        card.append(title, location, details, actions);
        list.append(card);
      });
      return addresses;
    } catch (error) {
      showAccountMessage(`Impossible de charger vos adresses : ${error.message}`, true);
      return [];
    }
  }

  function editAddress(address) {
    document.getElementById("address-id").value = String(address.id);
    document.getElementById("address-recipient").value = address.recipient_name;
    document.getElementById("address-phone").value = address.phone;
    document.getElementById("address-city").value = address.city;
    document.getElementById("address-commune").value = address.commune;
    document.getElementById("address-details").value = address.details;
    document.getElementById("address-default").checked = address.is_default;
    document.getElementById("address-form-title").textContent = "Modifier une adresse";
    document.getElementById("address-submit").textContent = "Enregistrer les changements";
    document.getElementById("address-cancel").hidden = false;
    document.getElementById("address-form").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function resetAddressForm() {
    const form = document.getElementById("address-form");
    form.reset();
    document.getElementById("address-id").value = "";
    document.getElementById("address-city").value = "Abidjan";
    document.getElementById("address-form-title").textContent = "Ajouter une adresse";
    document.getElementById("address-submit").textContent = "Enregistrer l’adresse";
    document.getElementById("address-cancel").hidden = true;
    clearFormError("address-error");
  }

  async function removeAddress(address) {
    const confirmed = window.confirm(`Supprimer l’adresse de ${address.commune} ?`);
    if (!confirmed) return;
    try {
      await api.apiFetch(`/addresses/${address.id}`, {
        method: "DELETE",
        headers: { "X-CSRF-Token": api.getCsrfToken() }
      });
      await loadAddresses();
      showAccountMessage("Adresse supprimée.", false);
    } catch (error) {
      showAccountMessage(`Impossible de supprimer l’adresse : ${error.message}`, true);
    }
  }

  async function loadOrders() {
    const list = document.getElementById("customer-order-list");
    const message = document.getElementById("orders-message");
    try {
      const result = await api.apiFetch("/orders");
      list.replaceChildren();
      if (!result.items.length) {
        message.hidden = false;
        message.textContent = "Aucune commande pour le moment. Votre prochaine surprise vous attend dans la boutique.";
        return;
      }
      message.hidden = true;
      const labels = {
        en_attente: "En attente de paiement",
        payee: "Payée",
        en_preparation: "En préparation",
        en_livraison: "En livraison",
        livree: "Livrée",
        annulee: "Annulée"
      };
      result.items.forEach((order) => {
        const card = document.createElement("article");
        card.className = "customer-order-card";
        const heading = document.createElement("div");
        heading.className = "customer-order-heading";
        const title = document.createElement("h3");
        title.textContent = `Commande ${order.order_number}`;
        const status = document.createElement("span");
        status.className = `order-status status-${order.status}`;
        status.textContent = labels[order.status] || order.status;
        heading.append(title, status);
        const summary = document.createElement("p");
        const quantity = order.items.reduce((total, item) => total + item.quantity, 0);
        summary.textContent = `${quantity} article${quantity === 1 ? "" : "s"} · ${order.delivery_commune}, ${order.delivery_city}`;
        const footer = document.createElement("div");
        footer.className = "customer-order-footer";
        const price = document.createElement("strong");
        price.textContent = api.formatPrice(order.total_xof);
        const date = document.createElement("time");
        date.dateTime = order.created_at;
        date.textContent = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(order.created_at));
        footer.append(price, date);
        const itemList = document.createElement("ul");
        itemList.className = "order-item-summary";
        order.items.forEach((item) => {
          const line = document.createElement("li");
          const options = Object.values(item.customization || {}).filter(Boolean);
          line.textContent = `${item.quantity} × ${item.product_name}${options.length ? ` · ${options.join(" · ")}` : ""}`;
          itemList.append(line);
        });
        card.append(heading, summary, itemList, footer);
        list.append(card);
      });
    } catch (error) {
      message.hidden = false;
      message.textContent = `Impossible de charger vos commandes : ${error.message}`;
    }
  }

  async function showDashboard() {
    if (!currentUser) return;
    authSection.hidden = true;
    dashboard.hidden = false;
    document.getElementById("welcome-name").textContent = `Bonjour ${currentUser.full_name} !`;
    document.getElementById("profile-name").value = currentUser.full_name;
    document.getElementById("profile-email").value = currentUser.email;
    document.getElementById("profile-phone").value = currentUser.phone || "";
    setPreferenceCheckboxes(currentUser);
    await Promise.all([loadAddresses(), loadOrders()]);
  }

  document.getElementById("login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthentication(event.currentTarget, "login", "login-error");
  });
  document.getElementById("register-form").addEventListener("submit", (event) => {
    event.preventDefault();
    submitAuthentication(event.currentTarget, "register", "register-error");
  });
  document.getElementById("show-register-form").addEventListener("click", () => showAuthForm("register"));
  document.getElementById("show-login-form").addEventListener("click", () => showAuthForm("login"));
  document.getElementById("show-forgot-form").addEventListener("click", () => {
    document.getElementById("login-form").hidden = true;
    document.getElementById("register-form").hidden = true;
    document.querySelector(".social-auth").hidden = true;
    document.getElementById("forgot-password-form").hidden = false;
    document.getElementById("forgot-email").value = document.getElementById("login-email").value;
    document.getElementById("forgot-email").focus();
  });
  document.getElementById("cancel-forgot-form").addEventListener("click", () => {
    clearFormError("forgot-error");
    document.getElementById("forgot-success").hidden = true;
    showAuthForm("login");
  });
  document.getElementById("forgot-password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError("forgot-error");
    const success = document.getElementById("forgot-success");
    success.hidden = true;
    try {
      const result = await api.apiFetch("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: document.getElementById("forgot-email").value.trim() })
      });
      success.hidden = false;
      success.textContent = result.message;
    } catch (error) {
      showFormError("forgot-error", error.message);
    }
  });
  document.getElementById("reset-password-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError("reset-error");
    try {
      await api.apiFetch("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({
          token: document.getElementById("reset-token").value,
          new_password: document.getElementById("reset-new-password").value
        })
      });
      document.getElementById("reset-password-form").hidden = true;
      document.getElementById("login-form").hidden = false;
      document.getElementById("register-form").hidden = true;
      document.querySelector(".social-auth").hidden = false;
      document.getElementById("forgot-password-form").hidden = true;
      showAccountMessage("Votre mot de passe a été modifié. Vous pouvez vous connecter.", false);
      window.history.replaceState({}, "", "compte.html");
    } catch (error) {
      showFormError("reset-error", error.message);
    }
  });

  document.getElementById("profile-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError("profile-error");
    const payload = {
      full_name: document.getElementById("profile-name").value.trim(),
      phone: document.getElementById("profile-phone").value.trim() || null,
      email_notifications_enabled: document.getElementById("email-notifications").checked,
      push_notifications_enabled: document.getElementById("push-notifications").checked
    };
    try {
      currentUser = await api.apiFetch("/auth/me", {
        method: "PATCH",
        headers: { "X-CSRF-Token": api.getCsrfToken() },
        body: JSON.stringify(payload)
      });
      document.getElementById("welcome-name").textContent = `Bonjour ${currentUser.full_name} !`;
      showAccountMessage("Votre profil a bien été enregistré.", false);
    } catch (error) {
      showFormError("profile-error", error.message);
    }
  });

  document.getElementById("address-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError("address-error");
    const id = document.getElementById("address-id").value;
    const payload = {
      recipient_name: document.getElementById("address-recipient").value.trim(),
      phone: document.getElementById("address-phone").value.trim(),
      city: document.getElementById("address-city").value.trim(),
      commune: document.getElementById("address-commune").value.trim(),
      details: document.getElementById("address-details").value.trim(),
      is_default: document.getElementById("address-default").checked
    };
    try {
      await api.apiFetch(id ? `/addresses/${id}` : "/addresses", {
        method: id ? "PUT" : "POST",
        headers: { "X-CSRF-Token": api.getCsrfToken() },
        body: JSON.stringify(payload)
      });
      resetAddressForm();
      await loadAddresses();
      showAccountMessage("Adresse enregistrée.", false);
    } catch (error) {
      showFormError("address-error", error.message);
    }
  });

  document.getElementById("address-cancel").addEventListener("click", resetAddressForm);
  document.getElementById("logout-button").addEventListener("click", async () => {
    try {
      await api.apiFetch("/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": api.getCsrfToken() }
      });
      window.location.assign("compte.html");
    } catch (error) {
      showAccountMessage(`La déconnexion a échoué : ${error.message}`, true);
    }
  });

  async function init() {
    const queryToken = new URLSearchParams(window.location.search).get("reset_token");
    const fragmentToken = new URLSearchParams(window.location.hash.slice(1)).get("reset_token");
    const resetToken = fragmentToken || queryToken;
    if (resetToken) {
      document.getElementById("auth-section").hidden = false;
      document.getElementById("login-form").hidden = true;
      document.getElementById("register-form").hidden = true;
      document.querySelector(".social-auth").hidden = true;
      document.getElementById("reset-password-form").hidden = false;
      document.getElementById("reset-token").value = resetToken;
      window.history.replaceState({}, "", "compte.html");
      return;
    }
    try {
      currentUser = await api.apiFetch("/auth/me");
      await showDashboard();
      if (window.location.hash === "#addresses" || window.location.hash === "#orders") {
        document.querySelector(window.location.hash).scrollIntoView({ block: "start" });
      }
    } catch (error) {
      if (error.status === 401) {
        authSection.hidden = false;
        dashboard.hidden = true;
        if (window.location.hash === "#creer-compte") showAuthForm("register");
        return;
      }
      showAccountMessage(`Impossible de vérifier votre compte : ${error.message}`, true);
    }
  }

  init();
}());
