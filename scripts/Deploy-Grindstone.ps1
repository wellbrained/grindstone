param()
# Builds the committed source on the PC and publishes .output/public as a new release on Hetzner
# (docs/deployment.md). The server keeps the previous releases for rollback.
$ErrorActionPreference = 'Stop'
$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$changes = & git -C $source status --porcelain
if ($LASTEXITCODE -ne 0 -or $changes) { throw 'Commit the changes before deploying.' }
$revision = (& git -C $source rev-parse --short=12 HEAD).Trim()
if ($revision -notmatch '^[a-f0-9]{12}$') { throw 'Invalid source revision.' }
$release = "$((Get-Date).ToUniversalTime().ToString('yyyyMMddHHmmss'))-$revision"
$public = Join-Path $source '.output\public'
Push-Location $source
try {
  & pnpm generate
  if ($LASTEXITCODE -ne 0) { throw 'Build failed; nothing was deployed.' }
} finally {
  Pop-Location
}
foreach ($file in 'index.html', '200.html') {
  if (-not (Test-Path (Join-Path $public $file))) { throw "The build left no $file; nothing was deployed." }
}
$archive = Join-Path $env:TEMP "grindstone-$release.tar.gz"
$key = 'D:\Server\vpn ssh-key-2026-10-05.key'
$remote = 'root@100.92.36.114'
$options = @('-i', $key, '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15')
& tar.exe -czf $archive -C $public .
if ($LASTEXITCODE -ne 0) { throw 'Packing the build failed.' }
try {
  & scp.exe @options $archive (Join-Path $source 'deploy\activate-static.sh') "${remote}:/tmp/"
  if ($LASTEXITCODE -ne 0) { throw 'Upload failed.' }
  & ssh.exe @options $remote "bash /tmp/activate-static.sh $release"
  if ($LASTEXITCODE -ne 0) { throw 'Deployment failed; the previous release is still live.' }
} finally {
  Remove-Item $archive -ErrorAction SilentlyContinue
}
