export type Project = { id: string; name: string; revision: number | null };
type Notice = { kind: "error" | "success"; text: string };
type Snapshot = {
  projects: Project[];
  selected: string;
  loading: boolean;
  refreshing: boolean;
  loadError: string;
  operation: { projectId: string; kind: "save" | "remove" } | null;
  notice: Notice | null;
};
type Api = {
  list(): Promise<{ projects: Project[] }>;
  save(input: { projectId: string; base64: string }): Promise<unknown>;
  remove(input: { projectId: string }): Promise<unknown>;
};

export function filterProjects(projects: Project[], query: string): Project[] {
  const term = query.trim().toLowerCase();
  return projects.filter((project) => project.name.toLowerCase().includes(term) || project.id.toLowerCase().includes(term));
}

export function createSettingsState(api: Api, changed: () => void) {
  let snapshot: Snapshot = {
    projects: [], selected: "", loading: true, refreshing: false,
    loadError: "", operation: null, notice: null,
  };
  let request = 0;
  let selectionVersion = 0;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const select = (id: string) => {
    if (id === snapshot.selected || !snapshot.projects.some((row) => row.id === id)) return;
    selectionVersion += 1;
    update({ selected: id, notice: null });
  };
  const refresh = async () => {
    const current = ++request;
    update({ refreshing: true });
    try {
      const { projects } = await api.list();
      if (current !== request) return;
      const selected = projects.some((row) => row.id === snapshot.selected) ? snapshot.selected : projects[0]?.id ?? "";
      const selectionChanged = selected !== snapshot.selected;
      if (selectionChanged) selectionVersion += 1;
      update({ projects, selected, loading: false, refreshing: false, loadError: "",
        ...(selectionChanged ? { notice: null } : {}) });
    } catch {
      if (current === request) update({
        loading: false, refreshing: false, loadError: "Could not load projects. Try again.",
      });
    }
  };
  const mutate = async (kind: "save" | "remove", prepare?: () => Promise<string>, ownerId?: string): Promise<"success" | "failed" | "skipped"> => {
    if (!snapshot.selected || snapshot.operation || (ownerId !== undefined && ownerId !== snapshot.selected)) return "skipped";
    const projectId = snapshot.selected;
    const version = selectionVersion;
    update({ operation: { projectId, kind }, notice: null });
    try {
      if (kind === "save") {
        if (!prepare) throw new Error("Missing image");
        const base64 = await prepare();
        await api.save({ projectId, base64 });
      } else {
        await api.remove({ projectId });
      }
      changed();
      void refresh();
      if (version === selectionVersion) update({
        notice: { kind: "success", text: kind === "save" ? "Icon saved." : "Icon removed." },
      });
      return "success";
    } catch {
      if (version === selectionVersion) update({
        notice: { kind: "error", text: kind === "save"
          ? "Could not save icon. Check the draft and try again."
          : "Could not remove icon. Try again." },
      });
      return "failed";
    } finally {
      update({ operation: null });
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select, refresh, mutate,
    cancel: () => { request += 1; selectionVersion += 1; },
  };
}
