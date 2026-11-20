package ci.snedai.snedai_scan;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import io.flutter.embedding.android.FlutterActivity;
import io.flutter.embedding.engine.FlutterEngine;
import io.flutter.plugin.common.EventChannel;
import io.flutter.plugin.common.MethodChannel;

/**
 * L'activité de l'application : elle fait le lien entre le lecteur de codes-barres du Zebra (DataWedge) et l'application Flutter.
 *
 * 1) Au démarrage de l'écran de scan, l'application demande « configurer » : on crée dans DataWedge un profil « SnedaiScan »
 *    réservé à cette application. Le lecteur y envoie le code lu par un message (« intent ») au lieu de « taper » les touches.
 * 2) Ce message est reçu ici, puis transmis à Flutter par le canal « scan ».
 * Sur un appareil qui n'est pas un Zebra, ces messages n'ont aucun effet : rien ne casse.
 */
public class MainActivity extends FlutterActivity {

    static final String CANAL_SCAN = "ci.snedai.snedai_scan/scan";
    static final String CANAL_CONFIGURATION = "ci.snedai.snedai_scan/datawedge";
    static final String ACTION_SCAN = "ci.snedai.snedai_scan.SCAN";
    static final String PROFIL = "SnedaiScan";

    static final String ACTION_DATAWEDGE = "com.symbol.datawedge.api.ACTION";
    static final String CLE_DONNEE = "com.symbol.datawedge.data_string";
    static final String CLE_DONNEE_ANCIENNE = "com.motorolasolutions.emdk.datawedge.data_string";   // anciennes versions de DataWedge

    private EventChannel.EventSink puits;
    private BroadcastReceiver recepteur;

    @Override
    public void configureFlutterEngine(FlutterEngine moteur) {
        super.configureFlutterEngine(moteur);
        new EventChannel(moteur.getDartExecutor().getBinaryMessenger(), CANAL_SCAN).setStreamHandler(new EventChannel.StreamHandler() {
            @Override
            public void onListen(Object arguments, EventChannel.EventSink events) {
                puits = events;
            }

            @Override
            public void onCancel(Object arguments) {
                puits = null;
            }
        });
        new MethodChannel(moteur.getDartExecutor().getBinaryMessenger(), CANAL_CONFIGURATION).setMethodCallHandler(
            (appel, resultat) -> {
                if ("configurer".equals(appel.method)) {
                    configurerDataWedge();
                    resultat.success(null);
                } else {
                    resultat.notImplemented();
                }
            });
    }

    @Override
    protected void onResume() {
        super.onResume();
        enregistrerRecepteur();
    }

    @Override
    protected void onPause() {
        retirerRecepteur();
        super.onPause();
    }

    /** Écoute les codes envoyés par DataWedge (un message « SCAN » avec le texte lu). */
    private void enregistrerRecepteur() {
        if (recepteur != null) return;
        recepteur = new BroadcastReceiver() {
            @Override
            public void onReceive(Context contexte, Intent intent) {
                String code = intent.getStringExtra(CLE_DONNEE);
                if (code == null) code = intent.getStringExtra(CLE_DONNEE_ANCIENNE);
                if (code != null && puits != null) puits.success(code);
            }
        };
        IntentFilter filtre = new IntentFilter(ACTION_SCAN);
        filtre.addCategory(Intent.CATEGORY_DEFAULT);
        if (Build.VERSION.SDK_INT >= 33) {
            registerReceiver(recepteur, filtre, Context.RECEIVER_EXPORTED);     // le message vient d'une autre application (DataWedge)
        } else {
            registerReceiver(recepteur, filtre);
        }
    }

    private void retirerRecepteur() {
        if (recepteur == null) return;
        try {
            unregisterReceiver(recepteur);
        } catch (IllegalArgumentException dejaRetire) {
            // rien à faire
        }
        recepteur = null;
    }

    /** Crée le profil DataWedge de l'application : lecteur actif, code envoyé par message, plus de « frappe de touches ». */
    private void configurerDataWedge() {
        Handler delai = new Handler(Looper.getMainLooper());
        envoyerADataWedge("com.symbol.datawedge.api.CREATE_PROFILE", PROFIL);
        delai.postDelayed(() -> envoyerADataWedge("com.symbol.datawedge.api.SET_CONFIG", profilLecteur()), 400);
        delai.postDelayed(() -> envoyerADataWedge("com.symbol.datawedge.api.SET_CONFIG", profilSortieMessage()), 900);
        delai.postDelayed(() -> envoyerADataWedge("com.symbol.datawedge.api.SET_CONFIG", profilSansClavier()), 1400);
    }

    private Bundle profil(String mode, Bundle plugin) {
        Bundle config = new Bundle();
        config.putString("PROFILE_NAME", PROFIL);
        config.putString("PROFILE_ENABLED", "true");
        config.putString("CONFIG_MODE", mode);
        config.putBundle("PLUGIN_CONFIG", plugin);
        return config;
    }

    private Bundle profilLecteur() {
        Bundle parametres = new Bundle();
        parametres.putString("scanner_selection", "auto");
        parametres.putString("scanner_input_enabled", "true");
        Bundle plugin = new Bundle();
        plugin.putString("PLUGIN_NAME", "BARCODE");
        plugin.putString("RESET_CONFIG", "true");
        plugin.putBundle("PARAM_LIST", parametres);
        Bundle config = profil("CREATE_IF_NOT_EXIST", plugin);
        Bundle application = new Bundle();                                      // ce profil ne s'applique qu'à cette application
        application.putString("PACKAGE_NAME", getPackageName());
        application.putStringArray("ACTIVITY_LIST", new String[] {"*"});
        config.putParcelableArray("APP_LIST", new Bundle[] {application});
        return config;
    }

    private Bundle profilSortieMessage() {
        Bundle parametres = new Bundle();
        parametres.putString("intent_output_enabled", "true");
        parametres.putString("intent_action", ACTION_SCAN);
        parametres.putString("intent_category", Intent.CATEGORY_DEFAULT);
        parametres.putString("intent_delivery", "2");                           // 2 = message diffusé (broadcast)
        Bundle plugin = new Bundle();
        plugin.putString("PLUGIN_NAME", "INTENT");
        plugin.putString("RESET_CONFIG", "true");
        plugin.putBundle("PARAM_LIST", parametres);
        return profil("UPDATE", plugin);
    }

    private Bundle profilSansClavier() {
        Bundle parametres = new Bundle();
        parametres.putString("keystroke_output_enabled", "false");              // pas de double envoi : le code arrive par le message
        Bundle plugin = new Bundle();
        plugin.putString("PLUGIN_NAME", "KEYSTROKE");
        plugin.putString("RESET_CONFIG", "true");
        plugin.putBundle("PARAM_LIST", parametres);
        return profil("UPDATE", plugin);
    }

    private void envoyerADataWedge(String commande, String texte) {
        Intent intent = new Intent(ACTION_DATAWEDGE);
        intent.setPackage("com.symbol.datawedge");
        intent.putExtra(commande, texte);
        sendBroadcast(intent);
    }

    private void envoyerADataWedge(String commande, Bundle contenu) {
        Intent intent = new Intent(ACTION_DATAWEDGE);
        intent.setPackage("com.symbol.datawedge");
        intent.putExtra(commande, contenu);
        sendBroadcast(intent);
    }
}
