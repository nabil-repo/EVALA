# Evala deploy to Sui Testnet (PowerShell)
# This script builds and publishes Move contracts, then auto-updates frontend/.env

# Check if sui CLI is available
$suiPath = (Get-Command sui -ErrorAction SilentlyContinue).Path
if (-not $suiPath) {
  Write-Host "❌ Sui CLI not found. Install options:" -ForegroundColor Red
  Write-Host "  1) Download: https://github.com/MystenLabs/sui/releases (add to PATH)"
  Write-Host "  2) With Rust: cargo install --locked --git https://github.com/MystenLabs/sui sui"
  exit 1
}

Write-Host "✓ Sui CLI found" -ForegroundColor Green

# Ensure testnet environment
$activeEnv = sui client active-env 2>&1
if ($activeEnv -notmatch "testnet") {
  Write-Host "Switching to testnet..." -ForegroundColor Yellow
  sui client switch --env testnet 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) {
    sui client new-env --alias testnet --rpc https://fullnode.testnet.sui.io:443 2>&1 | Out-Null
    sui client switch --env testnet 2>&1 | Out-Null
  }
}

Write-Host "Active: testnet" -ForegroundColor Green
Write-Host "Address: $(sui client active-address)" -ForegroundColor Cyan
Write-Host ""

# Build
Write-Host "Building Move package..." -ForegroundColor Yellow
Set-Location "$PSScriptRoot\..\contracts"
sui move build
if ($LASTEXITCODE -ne 0) { Write-Error "Build failed"; exit 1 }

# Publish
Write-Host ""
Write-Host "Publishing to testnet (gas budget: 100 MIST)..." -ForegroundColor Yellow
$publishJson = sui client publish --gas-budget 100000000 --json 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
  Write-Host "❌ Publish failed. Check errors above." -ForegroundColor Red
  exit 1
}

# Parse package ID
try {
  $result = $publishJson | ConvertFrom-Json
  $packageId = ($result.objectChanges | Where-Object { $_.type -eq "published" }).packageId
} catch {
  $packageId = $null
}

if (-not $packageId) {
  Write-Host "⚠️  Could not parse package ID. Check JSON output above." -ForegroundColor Yellow
  Write-Host $publishJson
  exit 1
}

Write-Host ""
Write-Host "✓ Published successfully!" -ForegroundColor Green
Write-Host "Package ID: $packageId" -ForegroundColor Cyan
Write-Host ""

# Auto-update .env
$envPath = "$PSScriptRoot\..\frontend\.env"
if (Test-Path $envPath) {
  $content = Get-Content $envPath -Raw
  $content = $content -replace 'NEXT_PUBLIC_PACKAGE_ID=.*', "NEXT_PUBLIC_PACKAGE_ID=$packageId"
  Set-Content -Path $envPath -Value $content -NoNewline
  Write-Host "✓ Updated frontend/.env with package ID" -ForegroundColor Green
} else {
  Write-Host "⚠️  frontend/.env not found. Create it from .env.example" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. cd frontend && npm run dev"
Write-Host "2. Visit /dashboard, click 'Init VoteBook', copy object ID to .env"
Write-Host ""
Write-Host "Explorer: https://suiscan.xyz/testnet/object/$packageId" -ForegroundColor Blue
