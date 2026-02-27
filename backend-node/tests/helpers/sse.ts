export interface ParsedSseEvent {
  event: string;
  data: string;
}

export const parseSse = (payload: string): ParsedSseEvent[] => {
  const blocks = payload.split(/\r?\n\r?\n/).map((entry) => entry.trim()).filter(Boolean);
  return blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim() ?? "message";
    const data = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart())
      .join("\n");
    return { event, data };
  });
};
