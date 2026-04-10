const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

let mainWindow = null;
let sidecar = null;
let nextRequestId = 1;
const pendingRequests = new Map();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#edeae5',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startSidecar() {
  if (sidecar) {
    return;
  }
  const python = resolvePythonExecutable();
  const repoRoot = path.resolve(__dirname, '..');
  sidecar = spawn(python, ['-m', 'client.runtime.entry'], {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      ...process.env,
      PYTHONUNBUFFERED: '1',
    },
  });

  const stdoutReader = readline.createInterface({ input: sidecar.stdout });
  stdoutReader.on('line', (line) => {
    if (!line.trim()) {
      return;
    }
    try {
      const message = JSON.parse(line);
      if (message.response && message.request_id) {
        const pending = pendingRequests.get(message.request_id);
        if (pending) {
          pendingRequests.delete(message.request_id);
          if (message.ok) {
            pending.resolve(message.data || {});
          } else {
            pending.reject(new Error(message.error || 'Unknown sidecar error'));
          }
        }
        return;
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('runtime:event', message);
      }
    } catch (error) {
      console.error('Failed to parse sidecar stdout line:', error, line);
    }
  });

  sidecar.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    console.error(`[hermes-sidecar] ${text}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('runtime:stderr', text);
    }
  });

  sidecar.on('exit', (code, signal) => {
    sidecar = null;
    for (const [requestId, pending] of pendingRequests.entries()) {
      pending.reject(new Error(`Sidecar exited before response (${code ?? signal ?? 'unknown'})`));
      pendingRequests.delete(requestId);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('runtime:event', {
        event: true,
        type: 'runtime.exit',
        payload: { code, signal },
      });
    }
  });
}

function resolvePythonExecutable() {
  if (process.env.HERMES_DESKTOP_PYTHON) {
    return process.env.HERMES_DESKTOP_PYTHON;
  }
  const repoRoot = path.resolve(__dirname, '..');
  const candidates = [
    path.join(repoRoot, 'venv', 'bin', 'python'),
    path.join(repoRoot, 'venv', 'bin', 'python3'),
    'python3',
    'python',
  ];
  return candidates.find((candidate) => candidate === 'python3' || candidate === 'python' || fs.existsSync(candidate));
}

function sendRuntimeCommand(type, payload = {}) {
  startSidecar();
  return new Promise((resolve, reject) => {
    if (!sidecar || sidecar.killed) {
      reject(new Error('Hermes sidecar is not running'));
      return;
    }
    const requestId = `req_${nextRequestId++}`;
    pendingRequests.set(requestId, { resolve, reject });
    sidecar.stdin.write(`${JSON.stringify({ request_id: requestId, type, payload })}\n`);
  });
}

app.whenReady().then(() => {
  createWindow();
  startSidecar();

  ipcMain.handle('runtime:command', async (_event, request) => {
    return await sendRuntimeCommand(request.type, request.payload || {});
  });

  ipcMain.handle('workspace:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (sidecar && !sidecar.killed) {
    sidecar.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
