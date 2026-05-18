#!/usr/bin/env node

const { execFile } = require('node:child_process');
const net = require('node:net');

const DEFAULT_PORT = 3001;
const port = Number.parseInt(process.argv[2] || process.env.PORT || String(DEFAULT_PORT), 10);
const isWindows = process.platform === 'win32';

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`[free-port] Invalid port: ${process.argv[2] || process.env.PORT}`);
  process.exit(1);
}

function execFileAsync(command, args) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function getWindowsPids(portToCheck) {
  const command = [
    '$ErrorActionPreference = "SilentlyContinue";',
    `$connections = Get-NetTCPConnection -LocalPort ${portToCheck} -State Listen;`,
    '$connections | Select-Object -ExpandProperty OwningProcess -Unique',
  ].join(' ');

  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
    ]);

    return parsePids(stdout);
  } catch {
    return getWindowsPidsFromNetstat(portToCheck);
  }
}

async function getWindowsPidsFromNetstat(portToCheck) {
  const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'tcp']);
  const pattern = new RegExp(`[:.]${portToCheck}\\s+.*LISTENING\\s+(\\d+)`, 'i');

  return stdout
    .split(/\r?\n/)
    .map((line) => line.match(pattern)?.[1])
    .filter(Boolean)
    .map(Number);
}

async function getUnixPids(portToCheck) {
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-ti',
      `tcp:${portToCheck}`,
      '-sTCP:LISTEN',
    ]);

    return parsePids(stdout);
  } catch {
    try {
      const { stdout } = await execFileAsync('fuser', [
        `${portToCheck}/tcp`,
      ]);

      return parsePids(stdout);
    } catch {
      return [];
    }
  }
}

function parsePids(value) {
  return Array.from(
    new Set(
      String(value)
        .split(/\s+/)
        .map((item) => Number.parseInt(item, 10))
        .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid),
    ),
  );
}

async function killPid(pid) {
  if (isWindows) {
    await execFileAsync('taskkill.exe', ['/PID', String(pid), '/T', '/F']);
    return;
  }

  try {
    await execFileAsync('kill', ['-TERM', String(pid)]);
  } catch {
    await execFileAsync('kill', ['-KILL', String(pid)]);
  }
}

function isPortFree(portToCheck) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(portToCheck, '0.0.0.0');
  });
}

async function waitForPortToBeFree(portToCheck) {
  const attempts = 20;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await isPortFree(portToCheck)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
}

async function main() {
  const pids = isWindows ? await getWindowsPids(port) : await getUnixPids(port);

  if (pids.length === 0) {
    console.log(`[free-port] Port ${port} is free.`);
    return;
  }

  console.log(`[free-port] Port ${port} is used by PID(s): ${pids.join(', ')}.`);

  for (const pid of pids) {
    await killPid(pid);
    console.log(`[free-port] Killed PID ${pid}.`);
  }

  if (!(await waitForPortToBeFree(port))) {
    throw new Error(`Port ${port} is still busy after killing PID(s): ${pids.join(', ')}`);
  }

  console.log(`[free-port] Port ${port} is free.`);
}

main().catch((error) => {
  console.error(`[free-port] ${error.message || error}`);
  process.exit(1);
});
