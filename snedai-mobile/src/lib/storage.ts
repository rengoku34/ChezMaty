import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Jeton de connexion : stocké dans le trousseau sécurisé du téléphone (Keychain / Keystore).
// Sur le web (utilisé seulement pour les essais), on se rabat sur localStorage.
const web = Platform.OS === 'web';

export async function getItem(key: string): Promise<string | null> {
  try {
    return web ? window.localStorage.getItem(key) : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    if (web) window.localStorage.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // Le stockage peut être indisponible : l'application reste utilisable, sans mémoriser la connexion.
  }
}

export async function deleteItem(key: string): Promise<void> {
  try {
    if (web) window.localStorage.removeItem(key);
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // voir ci-dessus
  }
}
