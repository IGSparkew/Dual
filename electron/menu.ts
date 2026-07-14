import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron';

/** Native File menu (New/Open/Save/Save As) — no business logic here, just
 *  IPC signals; the renderer (ProjectManager) does the actual work. */
export function buildMenu(win: BrowserWindow): void {
  const isMac = process.platform === 'darwin';

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: 'CmdOrCtrl+N',
        click: () => win.webContents.send('menu:new-project'),
      },
      {
        label: 'Open Project…',
        accelerator: 'CmdOrCtrl+O',
        click: () => win.webContents.send('menu:open-project'),
      },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => win.webContents.send('menu:save-project'),
      },
      {
        label: 'Save As…',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => win.webContents.send('menu:save-as-project'),
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };

  const exportMenu: MenuItemConstructorOptions = {
    label: 'Export',
    submenu: [
      {
        label: 'Export as WAV…',
        accelerator: 'CmdOrCtrl+Shift+E',
        click: () => win.webContents.send('menu:export-wav'),
      },
      {
        label: 'Copy strudel.cc Link',
        click: () => win.webContents.send('menu:copy-strudel-link'),
      },
      {
        label: 'Export File…',
        click: () => win.webContents.send('menu:export-file'),
      },
      { type: 'separator' },
      {
        label: 'Git',
        submenu: [
          {
            label: 'Commit Project',
            click: () => win.webContents.send('menu:git-commit'),
          },
          {
            label: 'Push to Remote',
            click: () => win.webContents.send('menu:git-push'),
          },
        ],
      },
    ],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          } as MenuItemConstructorOptions,
        ]
      : []),
    fileMenu,
    exportMenu,
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac
          ? ([
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ] as MenuItemConstructorOptions[])
          : ([
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ] as MenuItemConstructorOptions[])),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac
          ? ([
              { type: 'separator' },
              { role: 'front' },
              { type: 'separator' },
              { role: 'window' },
            ] as MenuItemConstructorOptions[])
          : ([{ role: 'close' }] as MenuItemConstructorOptions[])),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
