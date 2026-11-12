import { isRecord } from "./peer-gate.ts";

export const ENVIRONMENT_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_ENTRIES = 500;

export type EnvironmentChoice = { environmentId: string | null };

const text = (value: unknown): string | null => typeof value === "string" && value.length > 0 && value.length <= 4096 ? value : null;

export function pickEnvironment(project: unknown, environments: unknown, projectId: string): EnvironmentChoice | null {
  if (!isRecord(project) || project.id !== projectId || !Array.isArray(project.sources)) return null;
  const sources = project.sources.slice(0, MAX_ENTRIES).filter(isRecord);
  const source = sources.find(entry => entry.isDefault === true) ?? sources[0];
  const hostId = text(source?.hostId);
  if (!source || !hostId) return null;
  const sourcePath = text(source.path);
  const list = Array.isArray(environments) ? environments.slice(0, MAX_ENTRIES) : [];
  for (const entry of list) {
    if (!isRecord(entry) || entry.projectId !== projectId || entry.status !== "ready" || entry.hostId !== hostId) continue;
    if (!sourcePath || entry.path !== sourcePath) continue;
    if (isRecord(entry.lifecycle) && entry.lifecycle.phase !== "active") continue;
    if (typeof entry.id === "string" && ENVIRONMENT_ID.test(entry.id)) return { environmentId: entry.id };
  }
  return { environmentId: null };
}
