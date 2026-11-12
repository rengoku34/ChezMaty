# Lance les trois applications en arrière-plan, sans fenêtre : backend (8000), web (3000) et mobile (3001).
# Lancer :  powershell -ExecutionPolicy Bypass -File .\lancer.ps1
# Arrêter : powershell -ExecutionPolicy Bypass -File .\arreter.ps1
$racine = $PSScriptRoot
$python = Join-Path $racine ".venv\Scripts\python.exe"
$fichierPid = Join-Path $racine "serveurs.pid"
$dossierLogs = Join-Path $racine "logs"

# Si les serveurs tournent déjà, on les arrête d'abord pour ne pas les lancer deux fois.
if (Test-Path $fichierPid) { & (Join-Path $racine "arreter.ps1") }
New-Item -ItemType Directory -Force -Path $dossierLogs | Out-Null

function Demarrer($nom, $dossier, $arguments) {
    $processus = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $dossier -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $dossierLogs "$nom.log") -RedirectStandardError (Join-Path $dossierLogs "$nom.erreurs.log")
    return $processus.Id
}

$identifiants = @(
    (Demarrer "backend" $racine @("manage.py", "runserver", "0.0.0.0:8000")),
    (Demarrer "web" "$racine\web" @("-m", "http.server", "3000")),
    (Demarrer "mobile" "$racine\mobile" @("-m", "http.server", "3001"))
)
$identifiants | Set-Content $fichierPid

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object { $_.InterfaceAlias -like "*Wi-Fi*" -and $_.IPAddress -notlike "169.254*" } |
       Select-Object -First 1).IPAddress
if (-not $ip) { $ip = "localhost" }

Write-Host ""
Write-Host "Les serveurs tournent en arrière-plan (aucune fenêtre)."
Write-Host "Backend (API) : http://${ip}:8000/docs/"
Write-Host "Web           : http://${ip}:3000"
Write-Host "Mobile        : http://${ip}:3001"
Write-Host "Application Zebra (à télécharger depuis le Zebra) : http://${ip}:3001/snedai-scan.apk"
Write-Host ""
Write-Host "Pour arrêter : .\arreter.ps1      Journaux en cas de problème : dossier logs\"
Write-Host "Si l'adresse $ip est nouvelle, mets-la dans APP_URL (config\settings.py) pour les liens des e-mails."
