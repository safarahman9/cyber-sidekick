// main.js Electron main process for the AI Cybersafety Superhero desktop app.
//
// This is a thin native wrapper around the live PWA, same idea as the
// browser extension's popup.html iframe: one source of truth (the deployed
// site) instead of a second copy of the chat/diary logic to maintain.
//
// If you'd rather ship fully offline (no internet dependency at launch),
// change APP_URL below to `file://${path.join(__dirname, "app", "index.html")}`
// and copy the PWA's index.html + assets into desktop-app/app/. That works
// for the chat UI itself, but the chat still needs network access to reach
// your Netlify functions (chat.js, site-check.js, privacy-scan.js), since
// that's where the Anthropic and Safe Browsing calls actually happen.

const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const APP_URL = "https://aicybersafetysuperhero.netlify.app/";

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    title: "AI Cybersafety Superhero",
    icon: path.join(__dirname, "icon.png"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.setMenuBarVisibility(false);
  win.loadURL(APP_URL);

  // Open any link the page tries to open in a new window (e.g. "View the
  // full policy" links, CAFC report links) in the person's normal browser
  // instead of a second app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
