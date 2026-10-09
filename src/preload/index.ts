import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  FileFilter,
  HttpRequestPayload,
  HttpResponsePayload,
  SaveHistoryInput,
  SaveRequestInput,
  UpsertEnvironmentInput,
} from "../shared/types";

const api = {
  httpSend: (payload: HttpRequestPayload): Promise<HttpResponsePayload> =>
    ipcRenderer.invoke("http:send", payload),
  httpCancel: (requestId?: string): Promise<boolean> =>
    ipcRenderer.invoke("http:cancel", requestId),

  saveHistory: (input: SaveHistoryInput) => ipcRenderer.invoke("db:saveHistory", input),

  listHistory: (limit?: number) => ipcRenderer.invoke("db:listHistory", limit),
  clearHistory: () => ipcRenderer.invoke("db:clearHistory"),

  ensureDefaultEnvironment: () => ipcRenderer.invoke("db:ensureDefaultEnvironment"),
  listEnvironments: () => ipcRenderer.invoke("db:listEnvironments"),
  setActiveEnvironment: (id: number) => ipcRenderer.invoke("db:setActiveEnvironment", id),
  upsertEnvironment: (input: UpsertEnvironmentInput) =>
    ipcRenderer.invoke("db:upsertEnvironment", input),
  deleteEnvironment: (id: number) => ipcRenderer.invoke("db:deleteEnvironment", id),

  listCollections: () => ipcRenderer.invoke("db:listCollections"),
  createCollection: (name: string) => ipcRenderer.invoke("db:createCollection", name),
  renameCollection: (id: number, name: string) =>
    ipcRenderer.invoke("db:renameCollection", id, name),
  deleteCollection: (id: number) => ipcRenderer.invoke("db:deleteCollection", id),
  listSavedRequests: (collectionId?: number) =>
    ipcRenderer.invoke("db:listSavedRequests", collectionId),
  saveRequest: (input: SaveRequestInput) => ipcRenderer.invoke("db:saveRequest", input),
  renameSavedRequest: (id: number, name: string) =>
    ipcRenderer.invoke("db:renameSavedRequest", id, name),
  deleteSavedRequest: (id: number) => ipcRenderer.invoke("db:deleteSavedRequest", id),

  getSettings: () => ipcRenderer.invoke("db:getSettings"),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("db:saveSettings", settings),
  saveResponseBody: (body: string, suggestedName: string) =>
    ipcRenderer.invoke("dialog:saveResponse", body, suggestedName),
  pickFile: (filters?: FileFilter[]) => ipcRenderer.invoke("dialog:pickFile", filters),
  saveTextFile: (contents: string, suggestedName: string) =>
    ipcRenderer.invoke("dialog:saveText", contents, suggestedName),
  backupDatabase: () => ipcRenderer.invoke("dialog:backupDatabase"),
  restoreDatabase: () => ipcRenderer.invoke("dialog:restoreDatabase"),
};

contextBridge.exposeInMainWorld("tinypost", api);

export type TinyPostApi = typeof api;
