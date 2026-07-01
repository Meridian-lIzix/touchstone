# Touchstone 一键启动脚本：检查环境、安装依赖、初始化数据库、启动前后端
param(
  [string]$Root
)

# 固定本地服务地址，后续健康检查和浏览器打开都复用这两个 URL
$ErrorActionPreference = 'Stop'
$Url = 'http://127.0.0.1:4321/'
$ApiUrl = 'http://127.0.0.1:8787/api/leaderboard?category=image'

# 未传 Root 时默认使用脚本所在目录，方便双击启动
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Split-Path -Parent $MyInvocation.MyCommand.Path
}

# 后续所有相对路径都基于项目根目录执行
$Root = [IO.Path]::GetFullPath($Root)
Set-Location -LiteralPath $Root

Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue

# 统一失败出口：能弹窗就弹窗，然后以非零状态退出
function Fail([string]$Message) {
  if ('System.Windows.Forms.MessageBox' -as [type]) {
    [System.Windows.Forms.MessageBox]::Show($Message, 'Touchstone', 0, 16) | Out-Null
  }
  exit 1
}

# 统一提示入口：当前只负责打开下载或说明链接
function Ask([string]$Message, [string]$Url) {
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
  for ($i = 0; $i -lt $Seconds; $i++) {
    if (TestUrl $Target) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

# 运行外部命令并检查退出码，失败时走统一错误提示
function RunChecked([string]$FilePath, [string[]]$Arguments, [string]$FailureMessage) {
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

# 读取 SQLite 中 prompt 和作品数量，用于判断是否需要灌种子数据
function GetDbCounts {
  $code = "import { db } from './server/db.mjs'; const prompts = db.prepare('SELECT COUNT(*) AS n FROM prompts').get().n; const works = db.prepare('SELECT COUNT(*) AS n FROM works').get().n; console.log(JSON.stringify({ prompts, works }));"
  $output = & node --disable-warning=ExperimentalWarning --input-type=module -e $code 2>$null
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($output)) {
    return $null
  }
  return $output | ConvertFrom-Json
}

# 用隐藏窗口启动后台服务，避免用户桌面弹出多个终端
function StartHidden([string]$FilePath, [string[]]$Arguments) {
  Start-Process -FilePath $FilePath -ArgumentList $Arguments -WorkingDirectory $Root -WindowStyle Hidden
}

# 基础运行环境检查：Node、node:sqlite、corepack 缺一不可
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
if (-not (DependenciesReady)) {
  Ask 'Installing project dependencies ...' ''
  RunChecked 'corepack' @('pnpm', 'install', '--frozen-lockfile') 'Dependency installation failed.'
}

# 数据库为空时灌入示例 prompt 和占位作品，保证盲评页面可用
$counts = GetDbCounts
if ($null -eq $counts -or $counts.prompts -lt 1 -or $counts.works -lt 2) {
  RunChecked 'node' @('--disable-warning=ExperimentalWarning', 'server\seed.mjs') 'Database initialization failed.'
}

# 如果服务已经在跑就复用现有进程，否则分别启动后端和前端
$needBackend = -not (TestUrl $ApiUrl)
$needFrontend = -not (TestUrl $Url)

if ($needBackend) {
  StartHidden (Get-Command node).Source @('--disable-warning=ExperimentalWarning', 'server\index.mjs')
}

if ($needFrontend) {
  StartHidden (Join-Path $Root 'node_modules\.bin\astro.cmd') @('dev', '--host', '127.0.0.1')
}

# 最后打开前端首页，脚本本身退出，不占用当前窗口
Start-Process $Url
exit 0
