export type Role = 'admin' | 'agent' | 'employe';

export interface User {
  id: number;
  nom: string;
  prenom: string;
  email: string;
  filiale: string;
  role: Role;
}

export interface Participation {
  confirme: boolean;
  present: boolean;
  scanneLe: string | null;
}

// Les textes (dates, horaires…) arrivent déjà mis en forme par le serveur.
export interface EventItem {
  id: number;
  titre: string;
  description: string;
  lieu: string;
  termine: boolean;
  photo: string | null;
  quand: string;
  date: string;
  heures: string;
  jour: string | null;
  mois: string | null;
  debut: string | null;
  fin: string | null;
  enCours: boolean;
  participation: Participation | null;
}

export interface EventsResponse {
  ok: true;
  actifs: EventItem[];
  termines: EventItem[];
  prochainId: number | null;
}

export interface EventDetail {
  ok: true;
  event: EventItem;
  billet: { qr: string } | null;
  agenda: { google: string; outlook: string } | null;
  emailed?: boolean;
}

export interface AuthResponse {
  ok: true;
  token: string;
  user: User;
}

export interface SignupStart {
  ok: true;
  signupId: string;
  email: string;
  expiresInMinutes: number;
  resendInSeconds: number;
}

export interface ScanResult {
  ok: boolean;
  status: 'present' | 'deja' | 'termine' | 'inconnu';
  message: string;
  person?: { nom: string; prenom: string; filiale: string; evenement: string };
}
