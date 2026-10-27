"""Taux affichés dans le tableau de bord et le rapport PDF (en %, arrondis ; None si rien à diviser)."""


def percent(part, total):
    return round(part / total * 100) if total > 0 else None


def event_rates(inscrits, confirmes, presents):
    return {
        'reponse': percent(confirmes, inscrits),  # inscrits qui ont dit « je serai présent(e) »
        'presence': percent(presents, confirmes),  # présences annoncées réellement venues (QR scanné)
    }


def filiale_rows(rows):
    """Ajoute à chaque filiale ses taux et la largeur relative de sa barre dans le graphique."""
    biggest = max([1, *(r['inscrits'] for r in rows)])
    out = []
    for r in rows:
        out.append({
            **r,
            **event_rates(r['inscrits'], r['confirmes'], r['presents']),
            'bar_inscrits': round(r['inscrits'] / biggest * 100, 1),
            'bar_confirmes': round(r['confirmes'] / biggest * 100, 1),
            'bar_presents': round(r['presents'] / biggest * 100, 1),
        })
    return out
