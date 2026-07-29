import { contextBridge, ipcRenderer } from "electron";
import type {
  AuthConfig,
  HeaderItem,
  HttpRequestPayload,
  HttpResponsePayload,
  VariableItem,
} from "../shared/types";

const api = {
  httpSend: (payload: HttpRequestPayload): Promise<HttpResponsePayload> =>
    ipcRenderer.invoke("http:send", payload),

  saveHistory: (input: {
    method: string;
    url: string;
    headers: HeaderItem[];
    body: string;
    response: HttpResponsePayload;
  }) => ipcRenderer.invoke("db:saveHistory", input),

  listHistory: (limit?: number) => ipcRenderer.invoke("db:listHistory", limit),
  clearHistory: () => ipcRenderer.invoke("db:clearHistory"),

  ensureDefaultEnvironment: () => ipcRenderer.invoke("db:ensureDefaultEnvironment"),
  listEnvironments: () => ipcRenderer.invoke("db:listEnvironments"),
  setActiveEnvironment: (id: number) => ipcRenderer.invoke("db:setActiveEnvironment", id),
  upsertEnvironment: (input: {
    id?: number;
    name: string;
    variables: VariableItem[];
    makeActive?: boolean;
  }) => ipcRenderer.invoke("db:upsertEnvironment", input),
  deleteEnvironment: (id: number) => ipcRenderer.invoke("db:deleteEnvironment", id),

  listCollections: () => ipcRenderer.invoke("db:listCollections"),
  createCollection: (name: string) => ipcRenderer.invoke("db:createCollection", name),
  deleteCollection: (id: number) => ipcRenderer.invoke("db:deleteCollection", id),
  listSavedRequests: (collectionId?: number) =>
    ipcRenderer.invoke("db:listSavedRequests", collectionId),
  saveRequest: (input: {
    id?: number;
    collectionId: number;
    name: string;
    method: string;
    url: string;
    headers: HeaderItem[];
    body: string;
    auth: AuthConfig;
  }) => ipcRenderer.invoke("db:saveRequest", input),
  deleteSavedRequest: (id: number) => ipcRenderer.invoke("db:deleteSavedRequest", id),
};

contextBridge.exposeInMainWorld("tinypost", api);

export type TinyPostApi = typeof api;
