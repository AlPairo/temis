import { env } from "./env.js";

export type { Env } from "./env.js";
export { envSchema, parseEnv } from "./env.js";
export { env };

export type Config = Readonly<typeof env>;
export const config: Config = Object.freeze({ ...env });
