import type {
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
  saveHistory: (input: {
    method: string;
    url: string;
    headers: HeaderItem[];
    body: string;
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
  }) => Promise<number>;
  deleteSavedRequest: (id: number) => Promise<void>;
}

declare global {
  interface Window {
    tinypost: TinyPostApi;
  }
}

export {};
