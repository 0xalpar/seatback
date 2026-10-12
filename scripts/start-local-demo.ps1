param([string]$SbfPath='.cache/tested-sbf/target/deploy/seatback.so',[string]$ProjectName='')
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if(!$ProjectName){$ProjectName=if(Test-Path '.cache/local-project.txt'){(Get-Content '.cache/local-project.txt' -Raw).Trim()}else{'seatback-local'}}
if($ProjectName -notmatch '^seatback-local(?:-[a-z0-9-]+)?$'){throw 'Use a seatback-local project name containing only lowercase letters, digits and hyphens'}
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
docker compose -p $ProjectName -f compose.yaml -f compose.local.yaml config --quiet
if($LASTEXITCODE -ne 0){throw 'Local Compose configuration failed'}
docker compose -p $ProjectName -f compose.yaml -f compose.local.yaml up --build -d --wait --wait-timeout 180
if($LASTEXITCODE -ne 0){throw 'Local services failed; inspect compose ps/logs without printing secrets'}
$request=@{jsonrpc='2.0';id=1;method='getAccountInfo';params=@('SysvarC1ock11111111111111111111111111111111',@{encoding='base64'})}|ConvertTo-Json -Depth 5
$clock=Invoke-RestMethod -Uri 'http://127.0.0.1:8899' -Method Post -ContentType 'application/json' -Body $request
$chainSeconds=[BitConverter]::ToInt64([Convert]::FromBase64String($clock.result.value.data[0]),32)
if([Math]::Abs([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()-$chainSeconds) -gt 30){throw 'Persisted local ledger Clock lags host time. Preserve its volumes, stop that project, and start a new paired project with -ProjectName seatback-local-YYYYMMDD; see docs/local-validator-demo.md'}
Set-Content -LiteralPath '.cache/local-project.txt' -Value $ProjectName
Write-Output 'LOCAL Solana validator demo: http://localhost:5174 ; public Devnet was not deployed.'
