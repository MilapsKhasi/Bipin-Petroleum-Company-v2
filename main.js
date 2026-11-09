import { app, BrowserWindow, Menu, shell, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow = null;

// Ensure single instance lock for desktop stability
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  const isDev = !app.isPackaged && (process.env.NODE_ENV === 'development' || process.argv.includes('--dev'));

  function createMainWindow() {
    const appDir = app.getAppPath();
    const preloadCandidates = [
      path.join(appDir, 'preload.cjs'),
      path.join(__dirname, 'preload.cjs'),
      path.join(appDir, 'preload.js'),
      path.join(__dirname, 'preload.js')
    ];
    const preloadPath = preloadCandidates.find(p => fs.existsSync(p));

    mainWindow = new BrowserWindow({
      width: 1366,
      height: 850,
      minWidth: 1024,
      minHeight: 680,
      title: 'Bipin Petroleum Co. - Powered by ZenterPrime',
      backgroundColor: '#F7F8FC',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        ...(preloadPath ? { preload: preloadPath } : {}),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        spellcheck: false,
      }
    });

    // Remove default electron menu bar
    Menu.setApplicationMenu(null);
    mainWindow.setMenuBarVisibility(false);
    if (mainWindow.removeMenu) {
      mainWindow.removeMenu();
    }

    // Graceful ready-to-show to prevent white flashing
    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
      mainWindow.focus();
    });

    // Safety fallback: ensure window is visible even if ready-to-show event is missed
    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
      }
    }, 2500);

    // Allow F12 or Ctrl+Shift+I to toggle DevTools for diagnosis
    mainWindow.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'F12' || ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'i')) {
        mainWindow.webContents.toggleDevTools();
      }
    });

    // Diagnostic logging for render process issues
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error(`[Electron] Failed to load (${errorCode}): ${errorDescription} URL: ${validatedURL}`);
    });

    mainWindow.webContents.on('render-process-gone', (event, details) => {
      console.error('[Electron] Render process gone:', details);
    });

    // Intercept external links and open in default web browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('http:') || url.startsWith('https:')) {
        shell.openExternal(url);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
      if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1') || url.startsWith('file://')) {
        return;
      }
      if (url.startsWith('http:') || url.startsWith('https:')) {
        event.preventDefault();
        shell.openExternal(url);
      }
    });

    const devServerUrl = process.env.ELECTRON_START_URL || 'http://localhost:3000';
    const candidatePaths = [
      path.join(appDir, 'dist', 'index.html'),
      path.join(__dirname, 'dist', 'index.html'),
      path.join(process.cwd(), 'dist', 'index.html')
    ];
    const distIndexPath = candidatePaths.find(p => fs.existsSync(p));

    if (isDev) {
      mainWindow.loadURL(devServerUrl).catch(() => {
        console.log('[Electron] Dev server unreachable, falling back to dist/index.html');
        if (distIndexPath) {
          mainWindow.loadFile(distIndexPath).catch((err) => {
            console.error('[Electron] Failed to load local file in dev fallback:', err);
          });
        }
      });
    } else {
      if (distIndexPath) {
        mainWindow.loadFile(distIndexPath).catch((err) => {
          console.error('[Electron] Failed to load dist/index.html:', err);
        });
      } else {
        console.warn('[Electron] dist/index.html not found in candidate paths:', candidatePaths);
        mainWindow.loadURL(devServerUrl).catch((err) => {
          console.error('[Electron] Failed to load devServerUrl fallback:', err);
        });
      }
    }

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  }

  // App lifecycle
  app.whenReady().then(() => {
    // IPC handlers
    ipcMain.handle('app:version', () => app.getVersion());
    ipcMain.handle('app:platform', () => process.platform);
    ipcMain.on('app:quit', () => app.quit());
    ipcMain.on('app:minimize', () => mainWindow && mainWindow.minimize());
    ipcMain.on('app:maximize', () => {
      if (mainWindow) {
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize();
        } else {
          mainWindow.maximize();
        }
      }
    });
    ipcMain.on('app:reload', () => mainWindow && mainWindow.reload());
    ipcMain.on('app:toggle-devtools', () => mainWindow && mainWindow.webContents.toggleDevTools());
    ipcMain.handle('app:print', async (event, options) => {
      if (!mainWindow) return { success: false, error: 'No active window' };
      return new Promise((resolve) => {
        mainWindow.webContents.print(options || {}, (success, failureReason) => {
          resolve({ success, failureReason });
        });
      });
    });

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
