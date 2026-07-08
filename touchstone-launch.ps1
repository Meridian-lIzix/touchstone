# Touchstone 一键启动脚本：检查环境、安装依赖、初始化数据库、启动前后端
param(
  [string]$Root
)

# 固定本地服务地址，后续健康检查和浏览器打开都复用这两个 URL
$ErrorActionPreference = 'Stop'
$Url = 'http://127.0.0.1:4321/'
$ApiUrl = 'http://127.0.0.1:8787/api/leaderboard?category=image'
$AdminUrl = 'http://localhost:8790/'

# 未传 Root 时默认使用脚本所在目录，方便双击启动
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Split-Path -Parent $MyInvocation.MyCommand.Path
}

# 后续所有相对路径都基于项目根目录执行
$Root = [IO.Path]::GetFullPath($Root)
Set-Location -LiteralPath $Root

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

function ShowStep([string]$Message) {
  Write-Host ("[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message)
}

ShowStep 'Touchstone launcher started.'
ShowStep "Project root: $Root"

# 统一失败出口：能弹窗就弹窗，然后以非零状态退出
function Fail([string]$Message) {
  Write-Host ("[{0}] ERROR: {1}" -f (Get-Date -Format 'HH:mm:ss'), $Message) -ForegroundColor Red
  if ('System.Windows.Forms.MessageBox' -as [type]) {
    [System.Windows.Forms.MessageBox]::Show($Message, 'Touchstone', 0, 16) | Out-Null
  }
  exit 1
}

# 统一提示入口：当前只负责打开下载或说明链接
function Ask([string]$Message, [string]$Url) {
  ShowStep $Message
  if ($Url) {
    Start-Process $Url
  }
  return $true
}

# 判断命令是否存在，用于检查 node 和 corepack
function HasCommand([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# 短超时健康检查，避免启动脚本长时间卡住
function TestUrl([string]$Target) {
  try {
    $response = Invoke-WebRequest -Uri $Target -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

# 等待服务启动的通用轮询函数，当前保留给后续需要同步等待的场景
function WaitUrl([string]$Target, [int]$Seconds) {
  ShowStep "Waiting for $Target"
  $deadline = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $deadline) {
    if (TestUrl $Target) {
      ShowStep "Ready: $Target"
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  if (TestUrl $Target) {
    ShowStep "Ready: $Target"
    return $true
  }
  return $false
}

# 运行外部命令并检查退出码，失败时走统一错误提示
function RunChecked([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
  ShowStep ("Running: {0} {1}" -f $FilePath, ($Arguments -join ' '))
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    Fail $FailureMessage
  }
}

# 后端依赖 Node 24 的 node:sqlite，低版本 Node 会在这里被拦下
function NodeSupportsSqlite {
  & node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; new DatabaseSync(':memory:').close();" *> $null
  return $LASTEXITCODE -eq 0
}

# 判断前端和后端关键依赖是否已经安装，缺任一项就触发 pnpm install
function DependenciesReady {
  $paths = @(
    'node_modules\.bin\astro.cmd',
    'node_modules\astro\astro.js',
    'node_modules\hono\dist\index.js',
    'node_modules\@hono\node-server\dist\index.mjs'
  )

  foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      return $false
    }
  }

  return $true
}

function AstroGeneratedFilesReady {
  $paths = @(
    '.astro\content-assets.mjs',
    '.astro\content-modules.mjs',
    '.astro\content.d.ts',
    '.astro\types.d.ts'
  )

  foreach ($path in $paths) {
    if (-not (Test-Path -LiteralPath $path)) {
      return $false
    }
  }

  return $true
}

# 读取 SQLite 中 prompt 和作品数量，用于判断是否需要灌种子数据
function GetDbCounts {
  $code = "import { db } from './server/db.mjs'; const prompts = db.prepare('SELECT COUNT(*) AS n FROM prompts').get().n; const works = db.prepare('SELECT COUNT(*) AS n FROM works').get().n; console.log(JSON.stringify({ prompts, works }));"
  $output = & node --disable-warning=ExperimentalWarning --input-type=module -e $code 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($output)) {
    return $null
  }
  return $output | ConvertFrom-Json
}

function StartService([string]$FilePath, [string[]]$Arguments) {
  ShowStep ("Starting service: {0} {1}" -f $FilePath, ($Arguments -join ' '))
  Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $Root
}

function OpenPages {
  ShowStep 'Opening Touchstone pages...'
  Start-Sleep -Seconds 2
  Start-Process $Url
  Start-Process $AdminUrl
}

ShowStep 'Checking existing services...'

$backendReady = TestUrl $ApiUrl
$frontendReady = TestUrl $Url
$adminReady = TestUrl $AdminUrl

if ($backendReady -and $frontendReady -and $adminReady) {
  ShowStep 'All services are ready.'
  OpenPages
  exit 0
}

# 基础运行环境检查：Node、node:sqlite、corepack 缺一不可
ShowStep 'Checking local runtime...'

if (-not (HasCommand 'node')) {
  Ask 'Node.js not found.' 'https://nodejs.org/en/download'
  Fail 'Install Node.js 24 or newer, then run this file again.'
}

if (-not (NodeSupportsSqlite)) {
  Ask 'This Node.js version cannot run node:sqlite.' 'https://nodejs.org/en/download'
  Fail 'Install Node.js 24 or newer, then run this file again.'
}

if (-not (HasCommand 'corepack')) {
  Ask 'Corepack not found. Enable it with: corepack enable' 'https://nodejs.org/en/download'
  Fail 'Corepack is missing. Run: corepack enable, then try again.'
}

# 项目完整性检查：必须在 Touchstone 根目录内运行
if (-not (Test-Path -LiteralPath 'package.json') -or -not (Test-Path -LiteralPath 'pnpm-lock.yaml')) {
  Fail 'This folder is not a complete Touchstone project.'
}

# 依赖缺失时按锁文件安装，保证和仓库记录版本一致
ShowStep 'Checking project dependencies...'

if (-not (DependenciesReady)) {
  Ask 'Installing project dependencies ...' ''
  RunChecked 'corepack' @('pnpm', 'install', '--frozen-lockfile') 'Dependency installation failed.'
}

ShowStep 'Checking Astro generated files...'

if (-not (AstroGeneratedFilesReady)) {
  RunChecked (Join-Path $Root 'node_modules\.bin\astro.cmd') @('sync') 'Astro content sync failed.'
}

# 数据库为空时灌入示例 prompt 和占位作品，保证盲评页面可用
ShowStep 'Checking database seed data...'

$counts = GetDbCounts
if ($null -eq $counts -or $counts.prompts -lt 1 -or $counts.works -lt 2) {
  RunChecked 'node' @('--disable-warning=ExperimentalWarning', 'server\seed.mjs') 'Database initialization failed.'
}

# 如果服务已经在跑就复用现有进程，否则分别启动后端和前端
ShowStep 'Checking service readiness...'

$backendReady = TestUrl $ApiUrl
$frontendReady = TestUrl $Url
$adminReady = TestUrl $AdminUrl

$needBackend = -not $backendReady
$needFrontend = -not $frontendReady
$needAdmin = -not $adminReady

if ($needBackend) {
  StartService (Get-Command node).Source @('--watch', '--disable-warning=ExperimentalWarning', 'server\index.mjs')
} else {
  ShowStep 'API service already running.'
}

if ($needFrontend) {
  StartService (Join-Path $Root 'node_modules\.bin\astro.cmd') @('preview', '--host', '127.0.0.1', '--port', '4321')
} else {
  ShowStep 'Frontend already running.'
}

if ($needAdmin) {
  StartService (Get-Command node).Source @('--disable-warning=ExperimentalWarning', 'admin\index.mjs')
} else {
  ShowStep 'Admin service already running.'
}

if (-not (WaitUrl $ApiUrl 20)) {
  Fail 'API service did not become ready.'
}

if (-not (WaitUrl $Url 20)) {
  Fail 'Frontend did not become ready.'
}

if (-not (WaitUrl $AdminUrl 20)) {
  Fail 'Admin service did not become ready.'
}

# 最后打开前端首页，脚本本身退出，不占用当前窗口
OpenPages
exit 0
