import type {
  AppSettings,
  CollectionRow,
  EnvironmentRow,
  FileFilter,
  HistoryRow,
  SavedRequestRow,
  SaveHistoryInput,
  SaveRequestInput,
  UpsertEnvironmentInput,
} from "@shared/types";

function api() {
  return window.tinypost;
}

export async function saveHistory(input: SaveHistoryInput): Promise<void> {
  await api().saveHistory(input);
}

export async function listHistory(limit = 50): Promise<HistoryRow[]> {
  return api().listHistory(limit);
}

export async function clearHistory(): Promise<void> {
  await api().clearHistory();
}

export async function listEnvironments(): Promise<EnvironmentRow[]> {
  return api().listEnvironments();
}

export async function ensureDefaultEnvironment(): Promise<EnvironmentRow[]> {
  return api().ensureDefaultEnvironment();
}

export async function setActiveEnvironment(id: number): Promise<void> {
  await api().setActiveEnvironment(id);
}

export async function upsertEnvironment(input: UpsertEnvironmentInput): Promise<number> {
  return api().upsertEnvironment(input);
}

export async function deleteEnvironment(id: number): Promise<void> {
  await api().deleteEnvironment(id);
}

export async function listCollections(): Promise<CollectionRow[]> {
  return api().listCollections();
}

export async function createCollection(name: string): Promise<number> {
  return api().createCollection(name);
}

export async function renameCollection(id: number, name: string): Promise<void> {
  await api().renameCollection(id, name);
}

export async function deleteCollection(id: number): Promise<void> {
  await api().deleteCollection(id);
}

export async function listSavedRequests(
  collectionId?: number,
): Promise<SavedRequestRow[]> {
  return api().listSavedRequests(collectionId);
}

export async function saveRequest(input: SaveRequestInput): Promise<number> {
  return api().saveRequest(input);
}

export async function renameSavedRequest(id: number, name: string): Promise<void> {
  await api().renameSavedRequest(id, name);
}

export async function deleteSavedRequest(id: number): Promise<void> {
  await api().deleteSavedRequest(id);
}

export async function getSettings(): Promise<AppSettings> {
  return api().getSettings();
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await api().saveSettings(settings);
}

export async function saveResponseBody(
  body: string,
  suggestedName: string,
): Promise<boolean> {
  return api().saveResponseBody(body, suggestedName);
}

export async function httpCancel(requestId?: string): Promise<boolean> {
  return api().httpCancel(requestId);
}

export async function pickFile(filters?: FileFilter[]): Promise<string | null> {
  return api().pickFile(filters);
}

export async function saveTextFile(contents: string, suggestedName: string): Promise<boolean> {
  return api().saveTextFile(contents, suggestedName);
}

export async function backupDatabase(): Promise<boolean> {
  return api().backupDatabase();
}

export async function restoreDatabase(): Promise<boolean> {
  return api().restoreDatabase();
}
