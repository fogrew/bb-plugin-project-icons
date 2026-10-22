import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";

const idSchema = z.string().regex(/^proj_[a-z0-9]{10,32}$/);
const imageSchema = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(90000);
const MAX_PNG_BYTES = 65536;
export const rpcContract = defineRpcContract({
  list: { input: z.null(), output: z.object({ projects: z.array(z.object({ id: idSchema, name: z.string(), revision: z.number().nullable() })) }) },
  save: { input: z.object({ projectId: idSchema, base64: imageSchema }).strict(), output: z.object({ revision: z.number() }) },
  remove: { input: z.object({ projectId: idSchema }).strict(), output: z.object({ removed: z.boolean() }) },
});

type Index = Record<string, number>;
function decodePng(base64: string): Buffer {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 45 || bytes.length > MAX_PNG_BYTES || bytes.toString("base64") !== base64) throw new Error("Invalid image size or encoding");
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error("Only PNG images are accepted");
  if (bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR" || bytes.readUInt32BE(16) !== 64 || bytes.readUInt32BE(20) !== 64) throw new Error("Expected a 64 × 64 PNG");
  return bytes;
}

export default function plugin(bb: BbPluginApi) {
  const readIndex = async (): Promise<Index> => (await bb.storage.kv.get<Index>("index")) ?? {};
  let pending: Promise<void> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const result = pending.then(work);
    pending = result.then(() => undefined, () => undefined);
    return result;
  };
  const reconcile = () => serialize(async () => {
    const projects = await bb.sdk.projects.list();
    const projectIds = new Set(projects.map((project) => project.id));
    const index = await readIndex();
    let changed = false;
    for (const id of Object.keys(index)) {
      if (projectIds.has(id)) continue;
      delete index[id];
      await bb.storage.kv.delete(`image:${id}`);
      changed = true;
    }
    if (changed) await bb.storage.kv.set("index", index);
    return { projects, index };
  });
  const projectExists = async (id: string): Promise<boolean> => (await bb.sdk.projects.list()).some((project) => project.id === id);
  bb.rpc.register(rpcContract, {
    list: async () => {
      const { projects, index } = await reconcile();
      return { projects: projects.map((project) => ({ id: project.id, name: project.name, revision: index[project.id] ?? null })) };
    },
    save: ({ projectId, base64 }) => serialize(async () => {
      if (!(await projectExists(projectId))) throw new Error("Project not found");
      const bytes = decodePng(base64);
      const revision = Date.now();
      await bb.storage.kv.set(`image:${projectId}`, bytes.toString("base64"));
      await bb.storage.kv.set("index", { ...(await readIndex()), [projectId]: revision });
      bb.realtime.publish("changed", { projectId });
      return { revision };
    }),
    remove: ({ projectId }) => serialize(async () => {
      const index = await readIndex();
      const removed = projectId in index;
      delete index[projectId];
      await bb.storage.kv.delete(`image:${projectId}`);
      await bb.storage.kv.set("index", index);
      bb.realtime.publish("changed", { projectId });
      return { removed };
    }),
  });
  bb.http.route("GET", "/icons", async (context) => {
    const { index } = await reconcile();
    return context.json(index, 200, { "Cache-Control": "no-store" });
  });
  bb.http.route("GET", "/icon", async (context) => {
    const projectId = context.req.query("projectId") ?? "";
    if (!idSchema.safeParse(projectId).success) return context.text("Not found", 404);
    const base64 = await bb.storage.kv.get<string>(`image:${projectId}`);
    if (!base64) return context.text("Not found", 404);
    return new Response(Buffer.from(base64, "base64"), { headers: { "Content-Type": "image/png", "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
  });
}
