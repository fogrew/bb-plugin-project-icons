export type Project = { id: string; name: string; revision: number | null };
type Notice = { kind: "error" | "success"; text: string };
type Undo = { projectId: string; token: string; expiresAt: number };
type Snapshot = {
  projects: Project[];
  selected: string;
  loading: boolean;
  refreshing: boolean;
  loadError: string;
  operation: { projectId: string; kind: "save" | "remove" | "restore" } | null;
  undo: Undo | null;
  notice: Notice | null;
};
type Api = {
  list(): Promise<{ projects: Project[] }>;
  save(input: { projectId: string; base64: string }): Promise<unknown>;
  remove(input: { projectId: string }): Promise<{ undo: Omit<Undo, "projectId"> | null } | void>;
  restore(input: { projectId: string; token: string }): Promise<{ status: "restored" | "expired" | "conflict" }>;
};

export function filterProjects(projects: Project[], query: string): Project[] {
  const term = query.trim().toLowerCase();
  return projects.filter((project) => project.name.toLowerCase().includes(term) || project.id.toLowerCase().includes(term));
}

export function createSettingsState(api: Api, changed: () => void) {
  let snapshot: Snapshot = {
    projects: [], selected: "", loading: true, refreshing: false,
    loadError: "", operation: null, notice: null, undo: null,
  };
  let request = 0;
  let selectionVersion = 0;
  let lifetime = 0;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<Snapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const clearUndo = () => {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    update({ undo: null });
  };
  const expire = () => {
    if (!snapshot.undo) return;
    clearUndo();
    update({ notice: { kind: "error", text: "Undo expired. Refresh to check the current icon." } });
  };
  const offerUndo = (undo: Undo) => {
    clearUndo();
    update({ undo });
    const remaining = undo.expiresAt - Date.now();
    // The server is authoritative; also bound the client timer if its clock differs.
    expiryTimer = setTimeout(expire, Math.max(0, Math.min(15000, remaining)));
  };
  const select = (id: string) => {
    if (id === snapshot.selected || !snapshot.projects.some((row) => row.id === id)) return;
    selectionVersion += 1;
    clearUndo();
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
      const conflict = snapshot.undo && (selected !== snapshot.undo.projectId ||
        projects.find(row => row.id === snapshot.undo?.projectId)?.revision !== null);
      if (selectionChanged || conflict) clearUndo();
      update({ projects, selected, loading: false, refreshing: false, loadError: "",
        ...(selectionChanged ? { notice: null } : conflict ? {
          notice: { kind: "error", text: "Icon changed. Undo is no longer available." },
        } : {}) });
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
    const generation = lifetime;
    request += 1;
    clearUndo();
    update({ operation: { projectId, kind }, notice: null, refreshing: false });
    try {
      if (kind === "save") {
        if (!prepare) throw new Error("Missing image");
        const base64 = await prepare();
        if (generation !== lifetime) return "skipped";
        await api.save({ projectId, base64 });
      } else {
        const result = await api.remove({ projectId });
        if (generation === lifetime && version === selectionVersion && result?.undo) offerUndo({ projectId, ...result.undo });
      }
      if (generation !== lifetime) return "skipped";
      changed();
      void refresh();
      if (generation === lifetime && version === selectionVersion) update({
        notice: { kind: "success", text: kind === "save" ? "Icon saved." : "Icon removed." },
      });
      return "success";
    } catch {
      if (generation === lifetime && kind === "remove") void refresh();
      if (generation === lifetime && version === selectionVersion) update({
        notice: { kind: "error", text: kind === "save"
          ? "Could not save icon. Check the draft and try again."
          : "Could not remove icon. Try again." },
      });
      return "failed";
    } finally {
      if (generation === lifetime) update({ operation: null });
    }
  };
  const undo = async () => {
    const offer = snapshot.undo;
    if (!offer || snapshot.operation || offer.projectId !== snapshot.selected) return;
    if (Date.now() >= offer.expiresAt) { expire(); return; }
    const version = selectionVersion;
    const generation = lifetime;
    request += 1;
    clearUndo();
    update({ operation: { projectId: offer.projectId, kind: "restore" }, notice: null });
    try {
      const result = await api.restore({ projectId: offer.projectId, token: offer.token });
      if (generation !== lifetime) return;
      changed();
      void refresh();
      if (version === selectionVersion) update({ notice: result.status === "restored"
        ? { kind: "success", text: "Icon restored." }
        : { kind: "error", text: result.status === "expired"
          ? "Undo expired. Refresh to check the current icon."
          : "Icon changed or Undo is no longer available. Newer changes were preserved." } });
    } catch {
      if (generation === lifetime) {
        void refresh();
        if (version === selectionVersion) update({ notice: { kind: "error", text: "Could not restore icon. Refresh to check its current state; Undo cannot be retried." } });
      }
    } finally {
      if (generation === lifetime) update({ operation: null });
    }
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    select, refresh, mutate, undo,
    cancel: () => { request += 1; selectionVersion += 1; lifetime += 1; clearUndo(); update({ operation: null }); },
  };
}
