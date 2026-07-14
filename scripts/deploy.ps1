# One-command Cloud Run deployment for Copa Copilot (Windows PowerShell).
# Prereqs: gcloud CLI authenticated, billing-enabled project.
# Usage: .\scripts\deploy.ps1 -ProjectId event-manager-promptwars [-Region us-central1]
#
# Security: the Gemini key travels from the local gitignored apps/api/.env into
# Secret Manager and is mounted on the API service BY REFERENCE — it never enters
# an image, the repo, or the viewer-visible Cloud Run env-var config.
param(
  [string]$ProjectId = 'event-manager-promptwars',
  [string]$Region = 'us-central1'
)

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

Write-Host "==> Target project: $ProjectId ($Region)"
gcloud config set project $ProjectId | Out-Null

Write-Host '==> Enabling required services (idempotent)'
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com

Write-Host '==> Ensuring Artifact Registry repo exists'
$repoExists = gcloud artifacts repositories list --location=$Region --format='value(name)' 2>$null | Select-String 'copa-copilot'
if (-not $repoExists) {
  gcloud artifacts repositories create copa-copilot --repository-format=docker --location=$Region --description='Copa Copilot images'
}

Write-Host '==> Building + deploying API'
gcloud builds submit --config cloudbuild-api.yaml --substitutions=_REGION=$Region

# Push the Gemini key into Secret Manager and mount it (live mode).
$envFile = Join-Path $repoRoot 'apps\api\.env'
if (Test-Path $envFile) {
  $geminiKey = (Select-String -Path $envFile -Pattern '^GEMINI_API_KEY=(.+)$').Matches | ForEach-Object { $_.Groups[1].Value.Trim() } | Select-Object -First 1
  if ($geminiKey) {
    Write-Host '==> Storing Gemini key in Secret Manager (live mode)'
    $secretExists = gcloud secrets describe gemini-api-key --format='value(name)' 2>$null
    if ($secretExists) {
      $geminiKey | gcloud secrets versions add gemini-api-key --data-file=-
    } else {
      $geminiKey | gcloud secrets create gemini-api-key --data-file=-
    }
    $projectNumber = gcloud projects describe $ProjectId --format='value(projectNumber)'
    gcloud secrets add-iam-policy-binding gemini-api-key `
      --member="serviceAccount:$projectNumber-compute@developer.gserviceaccount.com" `
      --role='roles/secretmanager.secretAccessor' | Out-Null
    Write-Host '==> Mounting the secret + going live (DEMO_MODE=false)'
    gcloud run services update copa-copilot-api --region=$Region `
      --update-secrets="GEMINI_API_KEY=gemini-api-key:latest" `
      --update-env-vars="GEMINI_MODEL=gemini-2.5-flash,DEMO_MODE=false"
  }
}

$apiUrl = gcloud run services describe copa-copilot-api --region=$Region --format='value(status.url)'
Write-Host "==> API live at: $apiUrl"

Write-Host '==> Building + deploying web (client points at the API)'
gcloud builds submit --config cloudbuild-web.yaml "--substitutions=_REGION=$Region,_API_BASE_URL=$apiUrl"

Write-Host '==> Allowing the web origin through API CORS'
$webUrl = gcloud run services describe copa-copilot-web --region=$Region --format='value(status.url)'
gcloud run services update copa-copilot-api --region=$Region "--update-env-vars=^:^ALLOWED_ORIGINS=$webUrl,http://localhost:3100"

Write-Host ''
Write-Host '================ DEPLOYED ================'
Write-Host "Web: $webUrl"
Write-Host "API: $apiUrl"
Write-Host "Smoke: curl $apiUrl/api/meta"
