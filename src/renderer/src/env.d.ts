import type {
  AppSettings,
  AuthConfig,
  CollectionRow,
  EnvironmentRow,
  HeaderItem,
  HistoryRow,
  HttpRequestPayload,
  HttpResponsePayload,
  SavedRequestRow,
  VariableItem,
} from "@shared/types";

export interface TinyPostApi {
  httpSend: (payload: HttpRequestPayload) => Promise<HttpResponsePayload>;
  httpCancel: (requestId?: string) => Promise<boolean>;
  saveHistory: (input: {
    method: string;
    url: string;
    headers: HeaderItem[];
    body: string;
    auth: AuthConfig;
    query: string;
    response: HttpResponsePayload;
  }) => Promise<void>;
  listHistory: (limit?: number) => Promise<HistoryRow[]>;
  clearHistory: () => Promise<void>;
  ensureDefaultEnvironment: () => Promise<EnvironmentRow[]>;
  listEnvironments: () => Promise<EnvironmentRow[]>;
  setActiveEnvironment: (id: number) => Promise<void>;
  upsertEnvironment: (input: {
    id?: number;
    name: string;
    variables: VariableItem[];
    makeActive?: boolean;
  }) => Promise<number>;
  deleteEnvironment: (id: number) => Promise<void>;
  listCollections: () => Promise<CollectionRow[]>;
  createCollection: (name: string) => Promise<number>;
  renameCollection: (id: number, name: string) => Promise<void>;
  deleteCollection: (id: number) => Promise<void>;
  listSavedRequests: (collectionId?: number) => Promise<SavedRequestRow[]>;
  saveRequest: (input: {
    id?: number;
    collectionId: number;
    name: string;
    method: string;
    url: string;
    headers: HeaderItem[];
    body: string;
    auth: AuthConfig;
    query?: string;
  }) => Promise<number>;
  renameSavedRequest: (id: number, name: string) => Promise<void>;
  deleteSavedRequest: (id: number) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  saveResponseBody: (body: string, suggestedName: string) => Promise<boolean>;
}

declare global {
  interface Window {
    tinypost: TinyPostApi;
  }
}

export {};
