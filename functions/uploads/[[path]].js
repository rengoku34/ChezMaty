const API_ORIGIN = "https://chezmaty-api.onrender.com";

export async function onRequest({ request }) {
  const incoming = new URL(request.url);
  const destination = `${API_ORIGIN}${incoming.pathname}${incoming.search}`;
  const headers = new Headers(request.headers);
  headers.delete("origin");
  headers.delete("referer");

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  return fetch(destination, init);
}
