import { BrowserWindow, dialog, ipcMain } from "electron";
import fs from "node:fs";
import * as db from "./db";
import { getResponseBinary, httpCancel, httpSend } from "./http";
import type {
  AppSettings,
  FileFilter,
  HttpRequestPayload,
  SaveHistoryInput,
  SaveRequestInput,
  UpsertEnvironmentInput,
} from "../shared/types";

function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

export function registerIpc(): void {
  ipcMain.handle("http:send", async (_event, payload: HttpRequestPayload) => {
    return httpSend(payload);
  });
  ipcMain.handle("http:cancel", (_e, requestId?: string) => httpCancel(requestId));

  ipcMain.handle("db:saveHistory", (_e, input: SaveHistoryInput) => {
    db.saveHistory(input);
  });
  ipcMain.handle("db:listHistory", (_e, limit?: number) => db.listHistory(limit));
  ipcMain.handle("db:clearHistory", () => {
    db.clearHistory();
  });

  ipcMain.handle("db:ensureDefaultEnvironment", () => db.ensureDefaultEnvironment());
  ipcMain.handle("db:listEnvironments", () => db.listEnvironments());
  ipcMain.handle("db:setActiveEnvironment", (_e, id: number) => {
    db.setActiveEnvironment(id);
  });
  ipcMain.handle("db:upsertEnvironment", (_e, input: UpsertEnvironmentInput) =>
    db.upsertEnvironment(input),
  );
  ipcMain.handle("db:deleteEnvironment", (_e, id: number) => {
    db.deleteEnvironment(id);
  });

  ipcMain.handle("db:listCollections", () => db.listCollections());
  ipcMain.handle("db:createCollection", (_e, name: string) => db.createCollection(name));
  ipcMain.handle("db:renameCollection", (_e, id: number, name: string) => {
    db.renameCollection(id, name);
  });
  ipcMain.handle("db:deleteCollection", (_e, id: number) => {
    db.deleteCollection(id);
  });
  ipcMain.handle("db:listSavedRequests", (_e, collectionId?: number) =>
    db.listSavedRequests(collectionId),
  );
  ipcMain.handle("db:saveRequest", (_e, input: SaveRequestInput) => db.saveRequest(input));
  ipcMain.handle("db:renameSavedRequest", (_e, id: number, name: string) => {
    db.renameSavedRequest(id, name);
  });
  ipcMain.handle("db:deleteSavedRequest", (_e, id: number) => {
    db.deleteSavedRequest(id);
  });

  ipcMain.handle("db:getSettings", () => db.getSettings());
  ipcMain.handle("db:saveSettings", (_e, settings: AppSettings) => {
    db.saveSettings(settings);
  });

  ipcMain.handle("dialog:saveResponse", async (_e, body: string, suggestedName: string) => {
    return saveText(body, suggestedName, [
      { name: "Text", extensions: ["txt", "json", "xml", "html", "csv"] },
      { name: "All Files", extensions: ["*"] },
    ]);
  });

  ipcMain.handle(
    "dialog:saveBinaryResponse",
    async (_e, requestId: string, suggestedName: string) => {
      const bytes = getResponseBinary(requestId);
      if (!bytes) return false;
      return saveBytes(bytes, suggestedName, [{ name: "All Files", extensions: ["*"] }]);
    },
  );

  ipcMain.handle("dialog:pickFile", async (_e, filters?: FileFilter[]) => {
    const win = targetWindow();
    const options = {
      properties: ["openFile"] as "openFile"[],
      filters: filters?.length ? filters : undefined,
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    "dialog:saveText",
    async (_e, contents: string, suggestedName: string) => {
      return saveText(contents, suggestedName, [
        { name: "JSON", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ]);
    },
  );

  ipcMain.handle("dialog:backupDatabase", async () => {
    const win = targetWindow();
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const options = {
      defaultPath: `tinypost-backup-${stamp}.db`,
      filters: [{ name: "TinyPost Backup", extensions: ["db"] }],
    };
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    db.backupDatabase(result.filePath);
    return true;
  });

  ipcMain.handle("dialog:restoreDatabase", async () => {
    const win = targetWindow();
    const options = {
      filters: [{ name: "TinyPost Backup", extensions: ["db"] }],
      properties: ["openFile"] as "openFile"[],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return false;
    db.restoreDatabase(result.filePaths[0]);
    return true;
  });
}

async function saveText(
  contents: string,
  suggestedName: string,
  filters: FileFilter[],
): Promise<boolean> {
  const win = targetWindow();
  const options = { defaultPath: suggestedName, filters };
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, contents ?? "", "utf8");
  return true;
}

async function saveBytes(contents: Buffer, suggestedName: string, filters: FileFilter[]): Promise<boolean> {
  const win = targetWindow();
  const options = { defaultPath: suggestedName, filters };
  const result = win
    ? await dialog.showSaveDialog(win, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  fs.writeFileSync(result.filePath, contents);
  return true;
}
