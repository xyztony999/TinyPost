import { ipcMain } from "electron";
import * as db from "./db";
import { httpSend } from "./http";
import type { AuthConfig, HeaderItem, HttpRequestPayload, VariableItem } from "../shared/types";

export function registerIpc(): void {
  ipcMain.handle("http:send", async (_event, payload: HttpRequestPayload) => {
    return httpSend(payload);
  });

  ipcMain.handle("db:saveHistory", (_e, input) => {
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
  ipcMain.handle(
    "db:upsertEnvironment",
    (
      _e,
      input: {
        id?: number;
        name: string;
        variables: VariableItem[];
        makeActive?: boolean;
      },
    ) => db.upsertEnvironment(input),
  );
  ipcMain.handle("db:deleteEnvironment", (_e, id: number) => {
    db.deleteEnvironment(id);
  });

  ipcMain.handle("db:listCollections", () => db.listCollections());
  ipcMain.handle("db:createCollection", (_e, name: string) => db.createCollection(name));
  ipcMain.handle("db:deleteCollection", (_e, id: number) => {
    db.deleteCollection(id);
  });
  ipcMain.handle("db:listSavedRequests", (_e, collectionId?: number) =>
    db.listSavedRequests(collectionId),
  );
  ipcMain.handle(
    "db:saveRequest",
    (
      _e,
      input: {
        id?: number;
        collectionId: number;
        name: string;
        method: string;
        url: string;
        headers: HeaderItem[];
        body: string;
        auth: AuthConfig;
      },
    ) => db.saveRequest(input),
  );
  ipcMain.handle("db:deleteSavedRequest", (_e, id: number) => {
    db.deleteSavedRequest(id);
  });
}
