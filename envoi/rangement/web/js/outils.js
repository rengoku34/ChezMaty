/* Petits outils communs : fabriquer des éléments HTML, afficher un message, formater une date. */

/* Fabrique un élément HTML : h("div", {class: "carte"}, "texte", autreElement). Le texte est toujours inséré
   comme TEXTE (jamais comme HTML), donc une donnée saisie par un employé ne peut pas casser la page. */
export function h(balise, attributs = {}, ...enfants) {
  const element = document.createElement(balise);
  for (const [nom, valeur] of Object.entries(attributs)) {
    if (nom === "class") element.className = valeur;
    else if (nom.startsWith("on")) element.addEventListener(nom.slice(2), valeur);
    else if (valeur !== false && valeur != null) element.setAttribute(nom, valeur === true ? "" : valeur);
  }
  for (const enfant of enfants.flat()) {
    if (enfant != null && enfant !== false) element.append(enfant.nodeType ? enfant : document.createTextNode(String(enfant)));
  }
  return element;
}

const boiteMessage = document.getElementById("toast");
let minuteurMessage = null;
export function notifier(texte, erreur = false) {
  boiteMessage.textContent = texte;
  boiteMessage.className = "visible" + (erreur ? " erreur" : "");
  clearTimeout(minuteurMessage);
  minuteurMessage = setTimeout(() => { boiteMessage.className = ""; }, 3500);
}

export const formaterDate = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric" });

/* Une date renvoyée par l'API (« 2026-12-08T12:00:00Z ») devient la valeur d'un champ date + heure du navigateur. */
export function versChampLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const deux = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}T${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

/* Transforme la réponse d'erreur de l'API en phrases lisibles. */
export function phrases(donnees) {
  if (!donnees) return ["Une erreur est survenue."];
  if (typeof donnees === "string") return [donnees];
  const lignes = [];
  for (const [champ, messages] of Object.entries(donnees)) {
    const texte = Array.isArray(messages) ? messages.join(" ") : String(messages);
    lignes.push(champ === "detail" || champ === "non_field_errors" ? texte : `${champ} : ${texte}`);
  }
  return lignes;
}
