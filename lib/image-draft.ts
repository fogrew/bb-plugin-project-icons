// Each editor owns one project and invalidates all pending decodes on cancellation.
export function createDraft<T extends { close(): void }>(projectId: string, selected: () => string) {
  let generation = 0;
  let image: T | null = null;
  const cancel = () => {
    generation += 1;
    image?.close();
    image = null;
  };
  return {
    cancel,
    current: () => selected() === projectId ? image : null,
    async load(decode: () => Promise<T>) {
      cancel();
      const version = generation;
      const decoded = await decode();
      if (version !== generation || selected() !== projectId) {
        decoded.close();
        return false;
      }
      image = decoded;
      return true;
    },
  };
}
