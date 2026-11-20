import Constants from 'expo-constants';
import type { AuthResponse, EventDetail, EventsResponse, ScanResult, SignupStart, User } from './types';

// Adresse du serveur : EXPO_PUBLIC_API_URL (essais locaux), sinon la valeur de app.json.
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'https://snedai-evenements.onrender.com'
).replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public data?: Record<string, unknown>
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler;
};

// Hébergement gratuit : le serveur « dort » après un temps d'inactivité et met jusqu'à une minute à se réveiller.
const TIMEOUT_MS = 60_000;

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, auth = true): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${API_URL}/api/v1${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    let data: Record<string, unknown> | null = null;
    try {
      data = (await response.json()) as Record<string, unknown>;
    } catch {
      data = null;
    }
    if (!response.ok || data?.ok === false) {
      const code = typeof data?.code === 'string' ? data.code : undefined;
      if (response.status === 401 && auth && code === 'unauthorized') onUnauthorized?.();
      throw new ApiError(response.status, typeof data?.message === 'string' ? data.message : 'Une erreur est survenue. Réessayez.', code, data ?? undefined);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(0, 'Le serveur met du temps à répondre (il se réveille peut-être). Réessayez dans un instant.', 'timeout');
    }
    throw new ApiError(0, 'Impossible de joindre le serveur. Vérifiez votre connexion Internet.', 'network');
  } finally {
    clearTimeout(timer);
  }
}

const device = 'Application mobile';

export const api = {
  config: () => request<{ ok: true; filiales: string[]; inscriptionParEmail: boolean }>('GET', '/config', undefined, false),
  login: (email: string, password: string) => request<AuthResponse>('POST', '/auth/login', { email, password, appareil: device }, false),
  logout: () => request<{ ok: true }>('POST', '/auth/logout', {}),
  me: () => request<{ ok: true; user: User }>('GET', '/me'),

  signup: (form: { nom: string; prenom: string; filiale: string; email: string; password: string; confirmation: string }) =>
    request<SignupStart>('POST', '/auth/signup', form, false),
  verify: (signupId: string, code: string) => request<AuthResponse>('POST', '/auth/signup/verify', { signupId, code, appareil: device }, false),
  resend: (signupId: string) => request<{ ok: true; resendInSeconds: number }>('POST', '/auth/signup/resend', { signupId }, false),

  events: () => request<EventsResponse>('GET', '/events'),
  event: (id: number | string) => request<EventDetail>('GET', `/events/${id}`),
  participer: (id: number | string) => request<EventDetail>('POST', `/events/${id}/participer`, {}),
  annuler: (id: number | string) => request<EventDetail>('POST', `/events/${id}/annuler`, {}),

  // Le serveur répond aussi par des codes 404/409 pour « inconnu » et « déjà scanné » : ce sont des résultats, pas des pannes.
  async scan(code: string): Promise<ScanResult> {
    try {
      return await request<ScanResult>('POST', '/scan', { code });
    } catch (error) {
      if (error instanceof ApiError && typeof error.data?.status === 'string') return error.data as unknown as ScanResult;
      throw error;
    }
  },
};

// Les photos sont protégées : l'image est demandée avec le jeton de l'utilisateur.
export function photoSource(path: string | null): { uri: string; headers: Record<string, string> } | null {
  if (!path || !authToken) return null;
  return { uri: `${API_URL}${path}`, headers: { Authorization: `Bearer ${authToken}` } };
}
