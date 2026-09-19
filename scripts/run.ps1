param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Subcommand,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Rest,
  # Lets JSON be piped in, e.g. via a here-string: `@'...'@ | .\run.ps1 add-time-entry`.
  # Avoids PowerShell's unreliable re-quoting of --json-args for longer/complex JSON.
  [Parameter(ValueFromPipeline = $true)]
  [string]$PipelineJson
)

begin {
  $ErrorActionPreference = "Stop"
  $script:pipedLines = New-Object System.Collections.Generic.List[string]
}

process {
  if ($null -ne $PipelineJson) {
    $script:pipedLines.Add($PipelineJson)
  }
}

end {

$configDir = Join-Path $env:USERPROFILE ".cwplugin"
$nodePathFile = Join-Path $configDir "node-path.txt"
$cliPath = Join-Path $PSScriptRoot "dist\cli.js"

function Test-NodeExe {
  param([string]$Path)
  if (-not $Path) { return $false }
  if (-not (Test-Path -LiteralPath $Path)) { return $false }
  try {
    & $Path --version *> $null
    return $LASTEXITCODE -eq 0
  }
  catch {
    return $false
  }
}

function Resolve-NodePath {
  # 1. A path we successfully resolved before (works even if this terminal's
  #    PATH was never refreshed after installing Node).
  if (Test-Path -LiteralPath $nodePathFile) {
    $cached = (Get-Content -LiteralPath $nodePathFile -Raw).Trim()
    if (Test-NodeExe $cached) { return $cached }
  }

  # 2. node already resolvable via PATH in this session.
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  # 3. Well-known install locations — checked directly on disk, so this finds
  #    a just-installed Node.js immediately without needing a new terminal,
  #    a VS Code restart, or a PATH refresh of any kind.
  $candidates = @(
    (Join-Path $env:ProgramFiles "nodejs\node.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "nodejs\node.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe"),
    (Join-Path $env:APPDATA "npm\node.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-NodeExe $candidate) { return $candidate }
  }

  return $null
}

$nodePath = Resolve-NodePath

if (-not $nodePath) {
  $err = @{
    error = @{
      code    = "NODE_NOT_FOUND"
      message = "No se encontro Node.js 18+ en esta maquina. Instalalo (ej. 'winget install --id OpenJS.NodeJS.LTS -e --source winget') y vuelve a intentar; no hace falta reiniciar nada, este script busca Node de nuevo en cada llamada."
    }
  }
  Write-Output ($err | ConvertTo-Json -Compress)
  exit 1
}

# Cache the resolved path so future calls (including from a stale-PATH
# terminal) skip straight to it instead of re-searching every time.
New-Item -ItemType Directory -Force -Path $configDir | Out-Null
Set-Content -LiteralPath $nodePathFile -Value $nodePath -Encoding utf8 -NoNewline

if ($script:pipedLines.Count -gt 0) {
  # Forward whatever was piped in (e.g. a JSON here-string) as the child
  # process's stdin, so cli.js's --json-file-less stdin fallback picks it up.
  ($script:pipedLines -join "`n") | & $nodePath $cliPath $Subcommand @Rest
}
else {
  & $nodePath $cliPath $Subcommand @Rest
}
exit $LASTEXITCODE
}
