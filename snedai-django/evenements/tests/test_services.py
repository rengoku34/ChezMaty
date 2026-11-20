from datetime import datetime, timezone as dt_timezone
from types import SimpleNamespace

from django.test import SimpleTestCase, override_settings

from ..services import formatting, stats
from ..services.calendar_links import build_ics, calendar_links, event_times, wall_clock_to_date
from ..services.qr import token_from_scan
from ..services.validation import password_error
from ..services.verification import code_matches, generate_code, hash_code


def fake_event(**kwargs):
    base = dict(id=7, titre='Soirée, gala; 2026', description='Texte', lieu='Siège', debut='2026-11-14T09:00', fin='2026-11-14T16:00')
    return SimpleNamespace(**{**base, **kwargs})


class FormattingTests(SimpleTestCase):
    def test_dates_en_francais(self):
        self.assertEqual(formatting.event_date('2026-11-14T09:00'), 'samedi 14 novembre 2026 à 09:00')
        self.assertEqual(formatting.event_date('2026-11-01T09:00'), 'dimanche 1er novembre 2026 à 09:00')
        self.assertEqual(formatting.event_range('2026-11-14T09:00', '2026-11-14T16:00'), 'samedi 14 novembre 2026 à 09:00 – 16:00')
        self.assertEqual(formatting.event_range('2026-11-14T09:00', '2026-11-15T10:00'), 'samedi 14 novembre 2026 à 09:00 – dimanche 15 novembre 2026 à 10:00')
        self.assertEqual(formatting.event_range('2026-11-14T09:00', ''), 'samedi 14 novembre 2026 à 09:00')
        self.assertEqual(formatting.event_range('', ''), '')
        self.assertEqual(formatting.event_hours('2026-11-14T09:00', '2026-11-14T16:00'), '09:00 – 16:00')
        self.assertEqual(formatting.event_hours('2026-11-14T09:00', ''), '09:00')
        self.assertEqual(formatting.event_day('2026-02-03T09:00'), {'jour': '3', 'mois': 'févr'})
        self.assertIsNone(formatting.event_day('mauvais'))

    @override_settings(TIME_ZONE='Africa/Abidjan')
    def test_horodatage_dans_le_fuseau_du_site(self):
        self.assertEqual(formatting.timestamp(datetime(2026, 11, 14, 9, 5, tzinfo=dt_timezone.utc)), '14/11/2026 09:05')
        self.assertEqual(formatting.timestamp(None), '')


class CalendarTests(SimpleTestCase):
    @override_settings(TIME_ZONE='Africa/Abidjan')
    def test_heure_murale_convertie_en_instant(self):
        self.assertEqual(wall_clock_to_date('2026-11-14T09:00'), datetime(2026, 11, 14, 9, 0, tzinfo=dt_timezone.utc))
        self.assertIsNone(wall_clock_to_date('14/11/2026'))
        start, end = event_times(fake_event(fin=''))
        self.assertEqual((end - start).total_seconds(), 2 * 3600)  # durée par défaut

    @override_settings(TIME_ZONE='Europe/Paris')
    def test_fuseau_avec_decalage(self):
        self.assertEqual(wall_clock_to_date('2026-07-01T09:00'), datetime(2026, 7, 1, 7, 0, tzinfo=dt_timezone.utc))
        self.assertEqual(wall_clock_to_date('2026-01-01T09:00'), datetime(2026, 1, 1, 8, 0, tzinfo=dt_timezone.utc))

    @override_settings(APP_URL='https://snedai.example.com')
    def test_liens_agenda_et_fichier_ics(self):
        links = calendar_links(fake_event())
        self.assertIn('dates=20261114T090000Z%2F20261114T160000Z', links['google'])
        self.assertIn('startdt=2026-11-14T09%3A00%3A00.000Z', links['outlook'])
        self.assertEqual(links['ics'], '/evenements/7/agenda.ics')
        ics = build_ics(fake_event())
        self.assertIn('SUMMARY:Soirée\\, gala\; 2026', ics)
        self.assertIn('UID:evenement-7@snedai.example.com', ics)
        self.assertTrue(all(len(line.encode()) <= 75 for line in ics.split('\r\n')))
        self.assertIsNone(calendar_links(fake_event(debut='')))


class SmallServicesTests(SimpleTestCase):
    def test_lecture_du_qr(self):
        token = 'a' * 32
        self.assertEqual(token_from_scan(f'SNEDAI-EVT:{token}'), token)
        self.assertEqual(token_from_scan(f'  {token}\n'), token)
        self.assertIsNone(token_from_scan('SNEDAI-EVT:court'))
        self.assertIsNone(token_from_scan(None))

    def test_code_de_verification(self):
        code = generate_code()
        self.assertRegex(code, r'^\d{6}$')
        self.assertTrue(code_matches(code, hash_code(code)))
        self.assertTrue(code_matches(f'{code[:3]} {code[3:]}', hash_code(code)))
        self.assertFalse(code_matches('000000' if code != '000000' else '111111', hash_code(code)))
        self.assertFalse(code_matches(None, hash_code(code)))

    def test_mot_de_passe_et_taux(self):
        self.assertIsNone(password_error('motdepasse1'))
        for weak in ('court1', 'seulementdeslettres', '123456789'):
            self.assertIsNotNone(password_error(weak))
        self.assertEqual(stats.event_rates(10, 4, 3), {'reponse': 40, 'presence': 75})
        self.assertEqual(stats.event_rates(0, 0, 0), {'reponse': None, 'presence': None})
        rows = stats.filiale_rows([{'filiale': 'A', 'inscrits': 10, 'confirmes': 5, 'presents': 5}, {'filiale': 'B', 'inscrits': 5, 'confirmes': 0, 'presents': 0}])
        self.assertEqual((rows[0]['bar_inscrits'], rows[1]['bar_inscrits'], rows[1]['presence']), (100, 50, None))
