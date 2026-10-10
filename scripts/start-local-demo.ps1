param([string]$SbfPath='.cache/tested-sbf/target/deploy/seatback.so')
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if(!(Test-Path -LiteralPath '.env')){throw 'Prepare existing external secrets and the ignored Docker .env first; see docs/docker.md'}
if(!(Test-Path -LiteralPath $SbfPath)){throw 'Supply the actual compiled/tested seatback.so path with -SbfPath; no mock binary is generated'}
$context=Join-Path (Get-Location) '.cache/validator-image'
New-Item -ItemType Directory -Force -Path $context | Out-Null
$archive=Join-Path $context 'agave.tar.bz2'
if(!(Test-Path -LiteralPath $archive)){
 Invoke-WebRequest 'https://github.com/anza-xyz/agave/releases/download/v2.3.13/solana-release-x86_64-unknown-linux-gnu.tar.bz2' -OutFile $archive
}
$expected='c43539ebdf6942472e8b87635d6ea55f428a51e3d0219f7b6f720fc6b19fade0'
if((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected){throw 'Official Agave archive SHA256 mismatch; existing file preserved'}
$target=Join-Path (Get-Location) '.cache/tested-sbf/target/deploy/seatback.so'
New-Item -ItemType Directory -Force -Path (Split-Path $target) | Out-Null
if((Resolve-Path -LiteralPath $SbfPath).Path -ne $target){Copy-Item -LiteralPath $SbfPath -Destination $target}
docker compose -p seatback-local -f compose.yaml -f compose.local.yaml config --quiet
if($LASTEXITCODE -ne 0){throw 'Local Compose configuration failed'}
docker compose -p seatback-local -f compose.yaml -f compose.local.yaml up --build -d --wait --wait-timeout 180
if($LASTEXITCODE -ne 0){throw 'Local services failed; inspect compose ps/logs without printing secrets'}
Write-Output 'LOCAL Solana validator demo: http://localhost:5174 ; public Devnet was not deployed.'
