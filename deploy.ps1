param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("prod", "dev", "qa")]
    [string]$Environment = "prod",

    [Parameter(Mandatory = $false)]
    [string]$StackName,

    [Parameter(Mandatory = $false)]
    [string]$Region = "us-east-1",

    [Parameter(Mandatory = $false)]
    [string]$FrontendBucketName,

    [Parameter(Mandatory = $false)]
    [string]$FrontendS3Prefix = "",

    [Parameter(Mandatory = $false)]
    [string]$ApiUrl = "",

    [Parameter(Mandatory = $false)]
    [switch]$SkipFrontendHostingSetup
)

$ErrorActionPreference = "Stop"

# dev y qa son equivalentes: front en rpetc-dev, API del backend productivo.
if ($Environment -eq "qa") {
    $Environment = "dev"
}

if (-not $StackName) {
    $StackName = if ($Environment -eq "dev") { "rpetc-modern-app" } else { "rpetc-modern-app" }
}

function Read-EnvFile {
    param([string]$Path)
    $values = @{}
    if (-not (Test-Path $Path)) { return $values }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        $parts = $trimmed.Split("=", 2)
        if ($parts.Count -ne 2) { continue }
        $values[$parts[0].Trim()] = $parts[1].Trim()
    }
    return $values
}

function Resolve-Value {
    param(
        [string]$CurrentValue,
        [string]$EnvKey,
        [hashtable]$EnvMap,
        [string]$DefaultValue = ""
    )
    if ($CurrentValue) { return $CurrentValue }
    $envValue = (Get-Item -Path "Env:$EnvKey" -ErrorAction SilentlyContinue).Value
    if ($envValue) { return $envValue }
    if ($EnvMap.ContainsKey($EnvKey) -and $EnvMap[$EnvKey]) { return $EnvMap[$EnvKey] }
    return $DefaultValue
}

function Normalize-S3Prefix {
    param([string]$Raw)
    if ([string]::IsNullOrWhiteSpace($Raw)) { return "" }
    return ($Raw.Trim().Trim("/").Replace("\", "/"))
}

function Get-StackApiUrl {
    param(
        [string]$Name,
        [string]$AwsRegion
    )
    $value = aws cloudformation describe-stacks `
        --stack-name $Name `
        --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" `
        --output text `
        --region $AwsRegion
    if ($value -and $value -ne "None") { return $value.Trim() }
    return ""
}

$baseEnvPath = Join-Path $PSScriptRoot ".env"
$devEnvPath = Join-Path $PSScriptRoot ".env.dev"
$frontendEnv = @{}

if ($Environment -eq "dev") {
    if (Test-Path $baseEnvPath) {
        $frontendEnv = Read-EnvFile -Path $baseEnvPath
    }
    if (Test-Path $devEnvPath) {
        $overlay = Read-EnvFile -Path $devEnvPath
        foreach ($key in $overlay.Keys) {
            $frontendEnv[$key] = $overlay[$key]
        }
    }
}
elseif (Test-Path $baseEnvPath) {
    $frontendEnv = Read-EnvFile -Path $baseEnvPath
}

$FrontendBucketName = Resolve-Value $FrontendBucketName "FRONTEND_BUCKET" $frontendEnv
if (-not $FrontendBucketName) {
    $FrontendBucketName = Resolve-Value $FrontendBucketName "WEBSITE_BUCKET" $frontendEnv
}
if (-not $FrontendBucketName -and $Environment -eq "dev") {
    $FrontendBucketName = "rpetc-dev"
}
$FrontendS3Prefix = Resolve-Value $FrontendS3Prefix "FRONTEND_S3_PREFIX" $frontendEnv
$ApiUrl = Resolve-Value $ApiUrl "VITE_API_BASE_URL" $frontendEnv
$frontendPrefixNorm = Normalize-S3Prefix -Raw $FrontendS3Prefix

if (-not $FrontendBucketName) {
    throw "Falta FRONTEND_BUCKET. Definelo en .env o pasa -FrontendBucketName."
}

if (-not $ApiUrl) {
    $ApiUrl = Get-StackApiUrl -Name $StackName -AwsRegion $Region
}
if (-not $ApiUrl) {
    throw "VITE_API_BASE_URL no disponible. Despliega el backend, pasa -ApiUrl, o define VITE_API_BASE_URL en .env."
}

Write-Host "Ambiente: $Environment" -ForegroundColor Cyan
Write-Host "Stack CloudFormation (para ApiUrl): $StackName" -ForegroundColor Cyan
Write-Host "FrontendBucketName: $FrontendBucketName" -ForegroundColor Cyan
if ($frontendPrefixNorm) { Write-Host "FrontendS3Prefix: $frontendPrefixNorm" -ForegroundColor Cyan }
Write-Host "VITE_API_BASE_URL: $ApiUrl" -ForegroundColor Cyan

if (-not $SkipFrontendHostingSetup) {
    Write-Host "Configurando hosting estatico del frontend en S3..." -ForegroundColor Yellow
    aws s3 website "s3://$FrontendBucketName" `
        --index-document index.html `
        --error-document index.html `
        --region $Region
}

Push-Location $PSScriptRoot
try {
    if (-not (Test-Path "node_modules")) {
        npm install
    }
    $env:VITE_API_BASE_URL = $ApiUrl
    if ($frontendPrefixNorm) {
        $env:VITE_BASE_PATH = "/$frontendPrefixNorm/"
    }
    else {
        $env:VITE_BASE_PATH = "/"
    }
    npm run build
}
finally {
    Pop-Location
}

$distPath = Join-Path $PSScriptRoot "dist"
$frontendS3Dest = if ($frontendPrefixNorm) { "s3://$FrontendBucketName/$frontendPrefixNorm" } else { "s3://$FrontendBucketName" }
Write-Host "Subiendo build de frontend al bucket..." -ForegroundColor Yellow
aws s3 sync $distPath $frontendS3Dest --delete --region $Region

$frontendUrl = if ($frontendPrefixNorm) {
    "http://$FrontendBucketName.s3-website-$Region.amazonaws.com/$frontendPrefixNorm/"
}
else {
    "http://$FrontendBucketName.s3-website-$Region.amazonaws.com"
}

Write-Host ""
Write-Host "Deploy frontend finalizado." -ForegroundColor Green
Write-Host "FrontendUrl: $frontendUrl" -ForegroundColor Green
