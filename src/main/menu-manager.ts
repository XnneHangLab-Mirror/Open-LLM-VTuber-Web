/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  Tray, nativeImage, Menu, BrowserWindow, ipcMain, screen, MenuItemConstructorOptions, app,
} from 'electron';
import { screenRecordMenuItems, type ScreenRecordMenuState } from './screen-record-menu';
// @ts-expect-error
import trayIcon from '../../resources/icon.png?asset';

export interface ConfigFile {
  filename: string;
  name: string;
}

export class MenuManager {
  private tray: Tray | null = null;

  private currentMode: 'window' | 'pet' = 'window';

  private configFiles: ConfigFile[] = [];

  private recordingState: ScreenRecordMenuState = {};

  private recordingTarget: Electron.WebContents | null = null;

  private onRecordingState = (event: Electron.IpcMainEvent, state: ScreenRecordMenuState): void => {
    if (!state || typeof state !== 'object') return;
    this.recordingState = state;
    this.recordingTarget = event.sender;
    this.updateTrayMenu();
  };

  constructor(private onModeChange: (mode: 'window' | 'pet') => void) {
    this.setupContextMenu();
    ipcMain.on('screen-record-menu-state', this.onRecordingState);
  }

  createTray(): void {
    const icon = nativeImage.createFromPath(trayIcon);
    const trayIconResized = icon.resize({
      width: process.platform === 'win32' ? 16 : 18,
      height: process.platform === 'win32' ? 16 : 18,
    });

    this.tray = new Tray(trayIconResized);
    this.updateTrayMenu();
  }

  private getModeMenuItems(): MenuItemConstructorOptions[] {
    // console.log('Getting mode menu items, current mode:', this.currentMode)
    return [
      {
        label: 'Window Mode',
        type: 'radio' as const,
        checked: this.currentMode === 'window',
        click: () => {
          this.setMode('window');
        },
      },
      {
        label: 'Pet Mode',
        type: 'radio' as const,
        checked: this.currentMode === 'pet',
        click: () => {
          this.setMode('pet');
        },
      },
    ];
  }

  private updateTrayMenu(): void {
    if (!this.tray) return;
    // console.log('Updating tray menu, current mode:', this.currentMode)

    const contextMenu = Menu.buildFromTemplate([
      ...this.getModeMenuItems(),
      { type: 'separator' as const },
      ...screenRecordMenuItems(this.recordingState, (action) => {
        if (!this.recordingTarget?.isDestroyed()) this.recordingTarget?.send('screen-record-control', action);
      }),
      { type: 'separator' as const },
      // Only show toggle mouse ignore in pet mode
      ...(this.currentMode === 'pet'
        ? [
          {
            label: 'Toggle Mouse Passthrough',
            click: () => {
              const windows = BrowserWindow.getAllWindows();
              windows.forEach((window) => {
                window.webContents.send('toggle-force-ignore-mouse');
              });
            },
          },
          { type: 'separator' as const },
        ]
        : []),
      {
        label: 'Show',
        click: () => {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.show();
          });
        },
      },
      {
        label: 'Hide',
        click: () => {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.hide();
          });
        },
      },
      {
        label: 'Exit',
        click: () => {
          app.quit();
        },
      },
    ]);

    this.tray.setToolTip('Open LLM VTuber');
    this.tray.setContextMenu(contextMenu);
  }

  private getContextMenuItems(event: Electron.IpcMainEvent): MenuItemConstructorOptions[] {
    const template: MenuItemConstructorOptions[] = [
      ...screenRecordMenuItems(this.recordingState, (action) => event.sender.send('screen-record-control', action)),
      { type: 'separator' as const },
      {
        label: 'Toggle Microphone',
        click: () => {
          event.sender.send('mic-toggle');
        },
      },
      {
        label: 'Interrupt',
        click: () => {
          event.sender.send('interrupt');
        },
      },
      { type: 'separator' as const },
      // Only show in pet mode
      ...(this.currentMode === 'pet'
        ? [
          {
            label: 'Toggle Mouse Passthrough',
            click: () => {
              event.sender.send('toggle-force-ignore-mouse');
            },
          },
        ]
        : []),
      {
        label: 'Toggle Scrolling to Resize',
        click: () => {
          event.sender.send('toggle-scroll-to-resize');
        },
      },
      // Only show this item in pet mode
      ...(this.currentMode === 'pet'
        ? [
          {
            label: 'Toggle InputBox and Subtitle',
            click: () => {
              event.sender.send('toggle-input-subtitle');
            },
          },
        ]
        : []),
      { type: 'separator' as const },
      ...this.getModeMenuItems(),
      { type: 'separator' as const },
      {
        label: 'Switch Character',
        visible: this.currentMode === 'pet',
        submenu: this.configFiles.map((config) => ({
          label: config.name,
          click: () => {
            event.sender.send('switch-character', config.filename);
          },
        })),
      },
      { type: 'separator' as const },
      {
        label: 'Hide',
        click: () => {
          const windows = BrowserWindow.getAllWindows();
          windows.forEach((window) => {
            window.hide();
          });
        },
      },
      {
        label: 'Exit',
        click: () => {
          app.quit();
        },
      },
    ];
    return template;
  }

  private setupContextMenu(): void {
    ipcMain.on('show-context-menu', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win) {
        const screenPoint = screen.getCursorScreenPoint();
        const menu = Menu.buildFromTemplate(this.getContextMenuItems(event));
        menu.popup({
          window: win,
          x: Math.round(screenPoint.x),
          y: Math.round(screenPoint.y),
        });
      }
    });
  }

  setMode(mode: 'window' | 'pet'): void {
    // console.log('Setting mode from', this.currentMode, 'to', mode)
    this.currentMode = mode;
    this.updateTrayMenu();
    this.onModeChange(mode);
  }

  destroy(): void {
    ipcMain.removeListener('screen-record-menu-state', this.onRecordingState);
    this.recordingTarget = null;
    this.tray?.destroy();
    this.tray = null;
  }

  updateConfigFiles(files: ConfigFile[]): void {
    this.configFiles = files;
  }
}
