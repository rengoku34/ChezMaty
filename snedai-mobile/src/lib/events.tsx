import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from './api';
import type { EventItem } from './types';

interface EventsContextValue {
  actifs: EventItem[];
  termines: EventItem[];
  prochainId: number | null;
  loaded: boolean;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const EventsContext = createContext<EventsContextValue | null>(null);

// Liste des événements, partagée entre les onglets et rafraîchie quand l'application revient au premier plan.
export function EventsProvider({ children }: { children: ReactNode }) {
  const [actifs, setActifs] = useState<EventItem[]>([]);
  const [termines, setTermines] = useState<EventItem[]>([]);
  const [prochainId, setProchainId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    try {
      const data = await api.events();
      setActifs(data.actifs);
      setTermines(data.termines);
      setProchainId(data.prochainId);
      setError(null);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur est survenue.');
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo(
    () => ({ actifs, termines, prochainId, loaded, loading, error, refresh }),
    [actifs, termines, prochainId, loaded, loading, error, refresh]
  );
  return <EventsContext.Provider value={value}>{children}</EventsContext.Provider>;
}

export function useEvents(): EventsContextValue {
  const value = useContext(EventsContext);
  if (!value) throw new Error('useEvents doit être utilisé dans <EventsProvider>.');
  return value;
}
