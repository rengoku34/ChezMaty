const API_ORIGIN = "https://chezmaty-api.onrender.com";

export async function onRequest({ request }) {
  const incoming = new URL(request.url);
  const destination = `${API_ORIGIN}${incoming.pathname}${incoming.search}`;
  const headers = new Headers(request.headers);
  // The browser talks to this Pages Function on the same origin. The upstream
  // API should receive the session cookies and CSRF token, without a stale CORS origin.
  headers.delete("origin");
  headers.delete("referer");

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = request.body;
  return fetch(destination, init);
}
