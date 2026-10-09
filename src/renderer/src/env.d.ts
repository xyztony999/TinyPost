import type {
  AppSettings,
  CollectionRow,
  EnvironmentRow,
  FileFilter,
  HistoryRow,
  HttpRequestPayload,
  HttpResponsePayload,
  SavedRequestRow,
  SaveHistoryInput,
  SaveRequestInput,
  UpsertEnvironmentInput,
} from "@shared/types";

export interface TinyPostApi {
  httpSend: (payload: HttpRequestPayload) => Promise<HttpResponsePayload>;
  httpCancel: (requestId?: string) => Promise<boolean>;
  saveHistory: (input: SaveHistoryInput) => Promise<void>;
  listHistory: (limit?: number) => Promise<HistoryRow[]>;
  clearHistory: () => Promise<void>;
  ensureDefaultEnvironment: () => Promise<EnvironmentRow[]>;
  listEnvironments: () => Promise<EnvironmentRow[]>;
  setActiveEnvironment: (id: number) => Promise<void>;
  upsertEnvironment: (input: UpsertEnvironmentInput) => Promise<number>;
  deleteEnvironment: (id: number) => Promise<void>;
  listCollections: () => Promise<CollectionRow[]>;
  createCollection: (name: string) => Promise<number>;
  renameCollection: (id: number, name: string) => Promise<void>;
  deleteCollection: (id: number) => Promise<void>;
  listSavedRequests: (collectionId?: number) => Promise<SavedRequestRow[]>;
  saveRequest: (input: SaveRequestInput) => Promise<number>;
  renameSavedRequest: (id: number, name: string) => Promise<void>;
  deleteSavedRequest: (id: number) => Promise<void>;
  getSettings: () => Promise<AppSettings>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  saveResponseBody: (body: string, suggestedName: string) => Promise<boolean>;
  saveBinaryResponse: (requestId: string, suggestedName: string) => Promise<boolean>;
  pickFile: (filters?: FileFilter[]) => Promise<string | null>;
  saveTextFile: (contents: string, suggestedName: string) => Promise<boolean>;
  backupDatabase: () => Promise<boolean>;
  restoreDatabase: () => Promise<boolean>;
}

declare global {
  interface Window {
    tinypost: TinyPostApi;
  }
}

export {};
