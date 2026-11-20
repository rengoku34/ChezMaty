import { Redirect } from 'expo-router';
import { useAuth } from '../lib/auth';

// Point d'entrée : selon l'état de connexion, on arrive sur les événements ou sur la connexion.
export default function Index() {
  const { status } = useAuth();
  return <Redirect href={status === 'signedIn' ? '/evenements' : '/login'} />;
}
