import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../dist/server.js";
import { transparentPng } from "./png.mjs";

export const A = "proj_aaaaaaaaaa";
export const B = "proj_bbbbbbbbbb";
export const client = { experimental_caller: { kind: "client" } };
export const VERSIONS = {
  homepage: "0.2.7", "cursor-sidebar": "0.3.5", "nested-sidebar": "0.5.0", "chat-sidebar": "0.2.8",
  "bb-sidebar": "0.3.9", threadspace: "0.2.2", "project-themes": "0.1.0",
};
export const url = (bytes, mime = "image/png") => `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
export const unknownMethod = () => Object.assign(new Error("Unknown method"), { code: "unknown_method" });
export const hostile = text => JSON.parse(text);

export const defaultProject = id => ({
  id, name: id, kind: "standard", gitRemoteUrl: null,
  sources: [{ id: `src_${id}`, hostId: "host_1", isDefault: true, path: `/repo/${id}`, projectId: id, type: "local_path" }],
});
export const readyEnvironment = (projectId, extra = {}) => ({
  id: `env_${projectId}`, projectId, hostId: "host_1", path: `/repo/${projectId}`, status: "ready",
  lifecycle: { phase: "active" }, isWorktree: false, ...extra,
});

export function setup({
  peers = {}, projects = [{ id: A, name: "Alpha" }, { id: B, name: "Beta" }], getProject = defaultProject, listEnvironments = () => [],
  pluginRows,
} = {}) {
  const calls = [];
  const environmentCalls = [];
  const control = { listFails: false, listHangs: false };
  const rows = () => pluginRows !== undefined ? pluginRows : Object.entries(peers).map(([id, peer]) => ({
    id, version: peer.version ?? VERSIONS[id], enabled: peer.enabled ?? true, status: peer.status ?? "running",
  }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "project-icons",
    sdk: {
      projects: {
        list: async () => projects,
        get: async args => { const project = getProject(args.projectId); if (project instanceof Error) throw project; return project; },
      },
      environments: {
        list: async args => {
          environmentCalls.push(args);
          const result = listEnvironments(args);
          if (result instanceof Error) throw result;
          return result;
        },
      },
      plugins: {
        list: async () => {
          if (control.listFails) throw new Error("plugin list unavailable");
          if (control.listHangs) return new Promise(() => {});
          return { plugins: rows() };
        },
        callRpc: async args => {
          calls.push({ pluginId: args.pluginId, method: args.method, input: args.input });
          const peer = peers[args.pluginId];
          if (!peer) throw new Error("unknown plugin");
          if (peer.unknownMethod) throw unknownMethod();
          if (peer.hang) return new Promise((_, reject) => args.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
          const reply = typeof peer.reply === "function" ? peer.reply(args) : peer.reply;
          if (reply instanceof Error) throw reply;
          return reply;
        },
      },
    },
  });
  plugin(bb);
  const call = (method, input, caller = client) => harness.behavior.callRpc(method, input, caller);
  const scan = skip => call("adoptionScan", skip ? { skip } : {});
  const adopt = (candidate, extra = {}) => call("adoptPeer", {
    projectId: candidate.projectId, peer: candidate.peer, hash: candidate.hash, base64: transparentPng.toString("base64"),
    ifRevision: candidate.revision, ...extra,
  });
  const row = async id => (await call("list", null)).projects.find(project => project.id === id);
  const hintsResponse = () => harness.behavior.fetchHttp("GET", "/hints");
  const hints = async () => (await hintsResponse()).json();
  return { bb, harness, calls, environmentCalls, control, call, scan, adopt, row, hints, hintsResponse, dispose: () => harness.lifecycle.dispose() };
}
