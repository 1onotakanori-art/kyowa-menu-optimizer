#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const inputArgs = process.argv.slice(2);

if (inputArgs.length === 0) {
  console.error('Usage: node scripts/run-python.js <python-script> [args...]');
  process.exit(1);
}

function exists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function canExecute(command, args = []) {
  const result = spawnSync(command, [...args, '--version'], {
    cwd: repoRoot,
    stdio: 'ignore',
    shell: false
  });
  return result.status === 0;
}

function resolvePythonCommand() {
  if (process.env.PYTHON_CMD) {
    return { command: process.env.PYTHON_CMD, preArgs: [] };
  }

  const localVenvWin = path.join(repoRoot, '.venv', 'Scripts', 'python.exe');
  if (exists(localVenvWin)) {
    return { command: localVenvWin, preArgs: [] };
  }

  const localVenvUnixPy3 = path.join(repoRoot, '.venv', 'bin', 'python3');
  if (exists(localVenvUnixPy3)) {
    return { command: localVenvUnixPy3, preArgs: [] };
  }

  const localVenvUnixPy = path.join(repoRoot, '.venv', 'bin', 'python');
  if (exists(localVenvUnixPy)) {
    return { command: localVenvUnixPy, preArgs: [] };
  }

  const candidates = [
    { command: 'python', preArgs: [] },
    { command: 'python3', preArgs: [] },
    { command: 'py', preArgs: ['-3'] }
  ];

  for (const candidate of candidates) {
    if (canExecute(candidate.command, candidate.preArgs)) {
      return candidate;
    }
  }

  return null;
}

const python = resolvePythonCommand();

if (!python) {
  console.error('Python executable was not found. Please create .venv or set PYTHON_CMD.');
  process.exit(1);
}

const scriptPath = path.resolve(repoRoot, inputArgs[0]);
if (!exists(scriptPath)) {
  console.error(`Python script not found: ${inputArgs[0]}`);
  process.exit(1);
}

const runArgs = [...python.preArgs, scriptPath, ...inputArgs.slice(1)];
const child = spawnSync(python.command, runArgs, {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: false,
  env: process.env
});

if (child.error) {
  console.error(child.error.message);
  process.exit(1);
}

process.exit(child.status ?? 1);
