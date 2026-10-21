$root = $PSScriptRoot
$backendPath = Join-Path $root "backend"
$frontendPath = Join-Path $root "frontend"
$venvPython = Join-Path $root ".venv\Scripts\python.exe"

if (-not (Test-Path $venvPython)) {
    throw "Python virtual environment introuvable : $venvPython"
}

$backendCommand = @(
    "cd '$backendPath'"
    "`$env:PYTHONPATH = '$backendPath'"
    "& '$venvPython' -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
) -join "; "

$frontendCommand = @(
    "cd '$frontendPath'"
    "& '$venvPython' -m http.server 5500 --bind 127.0.0.1"
) -join "; "

Start-Process powershell -ArgumentList @('-NoExit', '-Command', $backendCommand) | Out-Null
Start-Process powershell -ArgumentList @('-NoExit', '-Command', $frontendCommand) | Out-Null

Write-Host "Serveurs demarres."
Write-Host "Backend : http://127.0.0.1:8000/health"
Write-Host "Frontend : http://127.0.0.1:5500"
