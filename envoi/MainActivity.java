package ci.snedai.scan;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.Toast;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Application « SNEDAI Scan » pour le Zebra.
 *
 * Elle affiche l'application mobile de scan (servie sur le port 3001 du serveur) en plein écran.
 * Le serveur est trouvé tout seul : l'application essaie la dernière adresse connue, puis, si elle ne répond plus
 * (changement de Wi-Fi par exemple), cherche le serveur SNEDAI sur le réseau actuel et mémorise sa nouvelle adresse.
 * Si rien n'est trouvé, une page d'erreur permet de réessayer ou de saisir l'adresse à la main.
 * Le lecteur du Zebra (DataWedge) « tape » le code dans la page, comme dans le navigateur.
 */
public class MainActivity extends Activity {

    static final String PREFS = "snedai_scan";
    static final String CLE_SERVEUR = "serveur";
    static final String PORT_PAR_DEFAUT = "3001";
    static final String PAGE_ERREUR = "file:///android_asset/erreur.html";
    static final String PAGE_RECHERCHE = "file:///android_asset/recherche.html";
    static final String FICHIER_SIGNATURE = "/snedai.txt";           // petit fichier servi par le serveur mobile : « snedai-scan »
    static final String SIGNATURE = "snedai-scan";
    static final int DELAI_CONNEXION = 600;                          // millisecondes par adresse essayée
    static final int DELAI_LECTURE = 900;
    static final int NOMBRE_DE_SONDES = 128;                         // adresses essayées en même temps
    static final int DUREE_MAX_RECHERCHE = 20;                       // secondes
    static final String TAG_DEMARRAGE = "ecran_demarrage";
    static final int DUREE_AFFICHAGE_LOGO = 1000;       // le logo reste visible 1 seconde...
    static final int DUREE_FONDU = 300;                  // ...puis disparaît en douceur

    private WebView webView;
    private SharedPreferences prefs;
    private boolean rechercheEnCours = false;
    private boolean rechercheFaite = false;     // une recherche vient d'avoir lieu : en cas de nouvelle panne, on affiche la page d'erreur
    private int numeroRecherche = 0;            // pour ignorer le résultat d'une recherche devenue inutile

    @Override
    protected void onCreate(Bundle etat) {
        super.onCreate(etat);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);   // l'écran reste allumé pendant les scans
        getWindow().setStatusBarColor(Color.parseColor("#26246A"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#EEF0F5"));
        WebSettings reglages = webView.getSettings();
        reglages.setJavaScriptEnabled(true);
        reglages.setDomStorageEnabled(true);                    // garde la connexion de l'agent (localStorage)
        reglages.setMediaPlaybackRequiresUserGesture(false);    // le bip du scan n'a pas besoin d'un toucher
        webView.addJavascriptInterface(new Pont(), "Android");
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView vue, WebResourceRequest requete, WebResourceError erreur) {
                if (requete.isForMainFrame()) serveurInjoignable();
            }

            @Override
            @SuppressWarnings("deprecation")
            public void onReceivedError(WebView vue, int code, String description, String url) {
                if (url != null && !url.startsWith("file:")) serveurInjoignable();
            }

            @Override
            public void onPageFinished(WebView vue, String url) {
                if (url != null && url.startsWith("http")) rechercheFaite = false;     // la page marche : une future panne relancera la recherche
            }
        });

        FrameLayout racine = new FrameLayout(this);
        racine.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        if (etat == null) {
            View ecran = creerEcranDeDemarrage();
            if (ecran != null) {
                racine.addView(ecran, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
                programmerFermeture(ecran);
            }
        }
        setContentView(racine);

        if (etat == null) charger();
    }

    /** Le logo SNEDAI, lu dans les ressources de l'application (null s'il est introuvable). */
    Bitmap chargerLogo() {
        try {
            InputStream flux = getAssets().open("logo.png");
            try {
                return BitmapFactory.decodeStream(flux);
            } finally {
                flux.close();
            }
        } catch (IOException erreur) {
            return null;
        }
    }

    /** L'écran de démarrage : le logo SNEDAI centré sur fond blanc (pendant ce temps, la page se charge derrière). */
    private View creerEcranDeDemarrage() {
        Bitmap logo = chargerLogo();
        if (logo == null) return null;                           // pas de logo : on entre directement dans l'application

        LinearLayout ecran = new LinearLayout(this);
        ecran.setTag(TAG_DEMARRAGE);
        ecran.setGravity(Gravity.CENTER);
        ecran.setBackgroundColor(Color.WHITE);
        ecran.setClickable(true);                                // les touches ne passent pas à travers pendant l'affichage
        ImageView image = new ImageView(this);
        image.setImageBitmap(logo);
        image.setAdjustViewBounds(true);
        int largeur = getResources().getDisplayMetrics().widthPixels * 3 / 4;
        ecran.addView(image, new LinearLayout.LayoutParams(largeur, ViewGroup.LayoutParams.WRAP_CONTENT));
        return ecran;
    }

    /** Après 1 seconde, le logo s'efface en fondu, puis l'écran de démarrage est retiré. */
    private void programmerFermeture(final View ecran) {
        ecran.postDelayed(new Runnable() {
            @Override
            public void run() {
                ecran.animate().alpha(0f).setDuration(DUREE_FONDU).start();
                ecran.postDelayed(new Runnable() {
                    @Override
                    public void run() {
                        ecran.setVisibility(View.GONE);
                        ViewGroup parent = (ViewGroup) ecran.getParent();
                        if (parent != null) parent.removeView(ecran);
                    }
                }, DUREE_FONDU + 30);
            }
        }, DUREE_AFFICHAGE_LOGO);
    }

    /** Ouvre l'application mobile du serveur ; si l'adresse n'est pas encore connue, le serveur est cherché sur le réseau. */
    void charger() {
        String hote = prefs.getString(CLE_SERVEUR, "");
        if (hote.length() == 0) {
            rechercher();
        } else {
            webView.loadUrl(urlDe(hote));
        }
    }

    /** La page ne s'ouvre pas : le serveur a peut-être changé d'adresse (autre Wi-Fi), on le cherche avant d'afficher l'erreur. */
    void serveurInjoignable() {
        if (rechercheEnCours) return;                // les erreurs d'une page abandonnée pendant la recherche sont ignorées
        if (rechercheFaite) {
            afficherErreur();
        } else {
            rechercher();
        }
    }

    /** Affiche « Recherche du serveur… » et cherche le serveur en arrière-plan, sans bloquer l'écran. */
    void rechercher() {
        rechercheEnCours = true;
        final int numero = ++numeroRecherche;
        webView.loadUrl(PAGE_RECHERCHE);
        executerEnArrierePlan(new Runnable() {
            @Override
            public void run() {
                final String hote = trouverServeur(prefs.getString(CLE_SERVEUR, ""));
                runOnUiThread(new Runnable() {
                    @Override
                    public void run() {
                        if (numero != numeroRecherche) return;
                        rechercheEnCours = false;
                        rechercheFaite = true;
                        if (hote != null) {
                            prefs.edit().putString(CLE_SERVEUR, hote).apply();
                            webView.loadUrl(urlDe(hote));
                        } else if (prefs.getString(CLE_SERVEUR, "").length() == 0) {
                            demanderServeur(false);              // rien trouvé et aucune adresse connue : saisie à la main, en dernier recours
                        } else {
                            afficherErreur();
                        }
                    }
                });
            }
        });
    }

    /** Surchargé par les tests pour travailler sans fil d'exécution séparé. */
    void executerEnArrierePlan(Runnable travail) {
        new Thread(travail).start();
    }

    /** L'adresse du serveur SNEDAI : la dernière connue si elle répond, sinon la première trouvée sur le réseau (null si aucune). */
    String trouverServeur(String derniereAdresse) {
        if (derniereAdresse != null && derniereAdresse.length() > 0 && sonder(derniereAdresse, DELAI_CONNEXION * 3, DELAI_LECTURE * 2)) {
            return derniereAdresse;
        }
        return chercherSurLeReseau();
    }

    /** Essaie toutes les adresses du réseau Wi-Fi actuel en parallèle et renvoie la première où répond le serveur SNEDAI. */
    String chercherSurLeReseau() {
        int[] reseau = adresseLocale();
        if (reseau == null) return null;
        final List<String> adresses = candidats(reseau[0], reseau[1]);
        final AtomicReference<String> trouve = new AtomicReference<String>(null);
        final CountDownLatch restantes = new CountDownLatch(adresses.size());
        ExecutorService equipe = Executors.newFixedThreadPool(NOMBRE_DE_SONDES);
        try {
            for (final String adresse : adresses) {
                equipe.execute(new Runnable() {
                    @Override
                    public void run() {
                        try {
                            if (trouve.get() == null && sonder(adresse, DELAI_CONNEXION, DELAI_LECTURE)) trouve.compareAndSet(null, adresse);
                        } finally {
                            restantes.countDown();
                        }
                    }
                });
            }
            long limite = System.currentTimeMillis() + DUREE_MAX_RECHERCHE * 1000L;
            while (trouve.get() == null && restantes.getCount() > 0 && System.currentTimeMillis() < limite) {
                restantes.await(100, TimeUnit.MILLISECONDS);
            }
        } catch (InterruptedException erreur) {
            Thread.currentThread().interrupt();
        } finally {
            equipe.shutdownNow();
        }
        return trouve.get();
    }

    /** Vrai si cette adresse héberge le serveur mobile SNEDAI (le fichier snedai.txt répond « snedai-scan »). */
    static boolean sonder(String hote, int delaiConnexion, int delaiLecture) {
        HttpURLConnection connexion = null;
        try {
            connexion = (HttpURLConnection) new URL(urlDe(hote).replaceAll("/$", "") + FICHIER_SIGNATURE).openConnection();
            connexion.setConnectTimeout(delaiConnexion);
            connexion.setReadTimeout(delaiLecture);
            connexion.setUseCaches(false);
            if (connexion.getResponseCode() != 200) return false;
            InputStream flux = connexion.getInputStream();
            byte[] contenu = new byte[64];
            int lus = flux.read(contenu);
            flux.close();
            return lus > 0 && new String(contenu, 0, lus, "UTF-8").contains(SIGNATURE);
        } catch (Exception erreur) {
            return false;
        } finally {
            if (connexion != null) connexion.disconnect();
        }
    }

    /** Toutes les adresses du réseau, sauf la nôtre (réseau limité à 1 022 adresses, c'est-à-dire un /22, pour que la recherche reste rapide). */
    static List<String> candidats(int moi, int prefixe) {
        if (prefixe < 22) prefixe = 22;
        if (prefixe > 30) prefixe = 24;
        int taille = 1 << (32 - prefixe);
        int base = moi & (-1 << (32 - prefixe));
        List<String> adresses = new ArrayList<String>();
        for (int i = 1; i < taille - 1; i++) {
            int adresse = base + i;
            if (adresse == moi) continue;
            adresses.add(((adresse >>> 24) & 255) + "." + ((adresse >>> 16) & 255) + "." + ((adresse >>> 8) & 255) + "." + (adresse & 255));
        }
        return adresses;
    }

    /** L'adresse du Zebra sur le Wi-Fi (ou sur un réseau local à défaut) : {adresse, longueur du préfixe}, null si hors réseau. */
    static int[] adresseLocale() {
        int[] choix = null;
        try {
            for (NetworkInterface carte : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!carte.isUp() || carte.isLoopback()) continue;
                for (InterfaceAddress interfaceAdresse : carte.getInterfaceAddresses()) {
                    InetAddress adresse = interfaceAdresse.getAddress();
                    if (!(adresse instanceof Inet4Address) || !adresse.isSiteLocalAddress()) continue;
                    byte[] octets = adresse.getAddress();
                    int valeur = ((octets[0] & 255) << 24) | ((octets[1] & 255) << 16) | ((octets[2] & 255) << 8) | (octets[3] & 255);
                    int[] possible = {valeur, interfaceAdresse.getNetworkPrefixLength()};
                    if (carte.getName().startsWith("wlan")) return possible;       // le Wi-Fi est prioritaire
                    if (choix == null) choix = possible;
                }
            }
        } catch (Exception erreur) {
            return choix;
        }
        return choix;
    }

    static String urlDe(String hote) {
        return "http://" + (hote.indexOf(':') >= 0 ? hote : hote + ":" + PORT_PAR_DEFAUT) + "/";
    }

    /** Garde seulement « adresse » ou « adresse:port » (enlève http://, les espaces et ce qui suit un /). */
    static String nettoyer(String saisie) {
        String texte = saisie == null ? "" : saisie.trim();
        if (texte.startsWith("http://")) texte = texte.substring(7);
        if (texte.startsWith("https://")) texte = texte.substring(8);
        int barre = texte.indexOf('/');
        if (barre >= 0) texte = texte.substring(0, barre);
        return texte.trim();
    }

    void afficherErreur() {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                webView.loadUrl(PAGE_ERREUR);
            }
        });
    }

    /** La fenêtre « Adresse du serveur ». */
    void demanderServeur(final boolean annulable) {
        final EditText champ = new EditText(this);
        champ.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        champ.setHint("Ex. : 172.30.12.140");
        champ.setText(prefs.getString(CLE_SERVEUR, ""));
        champ.setSelectAllOnFocus(true);

        AlertDialog.Builder fenetre = new AlertDialog.Builder(this)
                .setTitle("Adresse du serveur")
                .setMessage("Entrez l'adresse du serveur SNEDAI (celle affichée au lancement du serveur).")
                .setView(champ)
                .setCancelable(annulable)
                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(DialogInterface dialogue, int bouton) {
                        String hote = nettoyer(champ.getText().toString());
                        if (hote.length() == 0) {
                            Toast.makeText(MainActivity.this, "Adresse vide", Toast.LENGTH_SHORT).show();
                            demanderServeur(annulable);
                            return;
                        }
                        prefs.edit().putString(CLE_SERVEUR, hote).apply();
                        webView.loadUrl(urlDe(hote));
                    }
                });
        if (annulable) fenetre.setNegativeButton("Annuler", null);
        AlertDialog dialogue = fenetre.create();
        dialogue.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        dialogue.show();
    }

    /** Ce que la page d'erreur peut demander à l'application. */
    private class Pont {
        @JavascriptInterface
        public void reessayer() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    rechercher();
                }
            });
        }

        @JavascriptInterface
        public void changerServeur() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    demanderServeur(true);
                }
            });
        }

        @JavascriptInterface
        public String serveur() {
            return prefs.getString(CLE_SERVEUR, "");
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onPause() {
        webView.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
