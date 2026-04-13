#!/usr/bin/env node
/**
 * hide-panel — Gửi Ctrl+J vào đúng cửa sổ VSCode đang chạy lệnh (Windows only)
 *
 * Cài đặt:  cd /path/to/hide-panel && npm link
 * Dùng:     npm run build && hide-panel
 *           npm run build && hide-panel 800
 *           npm run build && hide-panel --ms=800
 */

const { execSync } = require("child_process");
const { writeFileSync, unlinkSync } = require("fs");
const { tmpdir } = require("os");
const { join } = require("path");

const DEFAULT_DELAY_MS = 400;

function parseDelay(argv) {
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const eqMatch = args[i].match(/^--ms=(\d+)$/);
    if (eqMatch) return parseInt(eqMatch[1], 10);
    if (args[i] === "--ms" && args[i + 1]) return parseInt(args[i + 1], 10) || DEFAULT_DELAY_MS;
    const n = parseInt(args[i], 10);
    if (!isNaN(n)) return n;
  }
  return DEFAULT_DELAY_MS;
}

function sendWindows() {
  const psScript = `
$ErrorActionPreference = 'SilentlyContinue'

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinAPI {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
}
'@

$hwnd = [WinAPI]::GetForegroundWindow()
$sb = New-Object System.Text.StringBuilder 512
[WinAPI]::GetWindowText($hwnd, $sb, 512) | Out-Null
$title = $sb.ToString()
$wsh = New-Object -ComObject WScript.Shell

if ($title -match 'Visual Studio Code') {
  Start-Sleep -Milliseconds 100
  $wsh.SendKeys('^j')
  Write-Output 'SENT_FOCUSED'
} else {
  $wins = @(Get-Process -Name 'Code' | Where-Object { $_.MainWindowTitle -ne '' })
  if ($wins.Count -eq 1) {
    $wsh.AppActivate($wins[0].Id) | Out-Null
    Start-Sleep -Milliseconds 200
    $wsh.SendKeys('^j')
    Write-Output 'SENT_SINGLE'
  } elseif ($wins.Count -eq 0) {
    Write-Output 'NO_VSCODE'
  } else {
    Write-Output "MULTIPLE_SKIP:$($wins.Count)"
  }
}
`.trim();

  const tmpFile = join(tmpdir(), `hide-panel-${Date.now()}.ps1`);
  writeFileSync(tmpFile, psScript, "utf8");

  let result = "";
  try {
    result = execSync(`powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "${tmpFile}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {}
  }

  if (result.startsWith("MULTIPLE_SKIP")) {
    const count = result.split(":")[1];
    process.stderr.write(`[hide-panel] Co ${count} cua so VSCode dang mo — khong the xac dinh cai nao, bo qua.\n`);
  }
}

async function main() {
  if (process.platform !== "win32") {
    process.stderr.write("[hide-panel] Chi ho tro Windows.\n");
    process.exit(0);
  }

  const delayMs = parseDelay(process.argv);
  await new Promise((r) => setTimeout(r, delayMs));

  try {
    sendWindows();
  } catch {
    // Không crash pipeline
  }
}

main();
