# Arrête les trois serveurs lancés par lancer.ps1.
# Utilisation :  powershell -ExecutionPolicy Bypass -File .\arreter.ps1
$fichierPid = Join-Path $PSScriptRoot "serveurs.pid"
if (-not (Test-Path $fichierPid)) {
    Write-Host "Aucun serveur lancé par lancer.ps1."
    return
}
foreach ($identifiant in Get-Content $fichierPid) {
    # /T arrête aussi le processus fils que Django démarre pour le rechargement automatique.
    taskkill /PID $identifiant /T /F 2>$null | Out-Null
}
Remove-Item $fichierPid
Write-Host "Serveurs arrêtés."
