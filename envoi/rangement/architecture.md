# Architecture

Un seul serveur (`runserver`, port 8000) sert le site, l'API et le fichier d'installation de l'application mobile :

- **backend** : l'API sous `/api/`, les pages des employés (`/e/...`, `/billet/...`) et le backoffice (`/admin/`).
- **web** : l'application de l'administrateur, à la racine `/`.
- **mobile** : l'application Flutter des agents, installée sur le Zebra. Elle n'est pas servie par le site : elle appelle l'API.

L'application web et l'application mobile ne gardent aucune donnée et n'appliquent aucune règle : elles envoient des demandes à
l'API, qui décide. L'application web appelle l'API par des liens relatifs (`/api/...`). L'application mobile retrouve le serveur
sur le Wi-Fi grâce à `/api/ping/`.

Rôles : l'administrateur est un compte « staff », l'agent de scan appartient au groupe « Agents de scan », l'employé n'a pas de compte.
