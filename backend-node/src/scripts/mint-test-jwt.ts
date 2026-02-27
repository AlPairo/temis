import crypto from "node:crypto";

type Role = "basic" | "supervisor" | "admin";

interface CliOptions {
  sub: string;
  role: Role;
  expiresInSeconds: number;
  issuer?: string;
  audience?: string;
  roleClaim: string;
}

const ROLE_VALUES = new Set<Role>(["basic", "supervisor", "admin"]);

const usage = `Usage:
  npm run mint:test-jwt -- --sub u-demo --role basic

Options:
  --sub <id>              JWT sub (user id). Default: u-demo
  --role <role>           basic | supervisor | admin. Default: basic
  --exp-seconds <n>       Expiration in seconds from now. Default: 3600
  --iss <issuer>          Override issuer claim (defaults to AUTH_JWT_ISSUER if set)
  --aud <audience>        Override audience claim (defaults to AUTH_JWT_AUDIENCE if set)
  --role-claim <name>     Role claim name. Default: AUTH_JWT_ROLE_CLAIM or 'role'

Environment:
  AUTH_JWT_SECRET         Required for signing (HS256)
  AUTH_JWT_ISSUER         Optional default issuer
  AUTH_JWT_AUDIENCE       Optional default audience
  AUTH_JWT_ROLE_CLAIM     Optional default role claim name
`;

const readArg = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
};

const readIntArg = (name: string, fallback: number): number => {
  const raw = readArg(name);
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid value for ${name}: '${raw}'`);
  }
  return parsed;
};

const base64UrlEncode = (value: string): string =>
  Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const base64UrlEncodeBuffer = (value: Buffer): string =>
  value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const signHs256 = (data: string, secret: string): string =>
  base64UrlEncodeBuffer(crypto.createHmac("sha256", secret).update(data).digest());

function parseOptions(): CliOptions {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.info(usage);
    process.exit(0);
  }

  const sub = readArg("--sub")?.trim() || "u-demo";
  const roleRaw = (readArg("--role")?.trim().toLowerCase() || "basic") as Role;
  if (!ROLE_VALUES.has(roleRaw)) {
    throw new Error(`Invalid --role '${roleRaw}'. Expected basic|supervisor|admin`);
  }

  return {
    sub,
    role: roleRaw,
    expiresInSeconds: readIntArg("--exp-seconds", 3600),
    issuer: readArg("--iss")?.trim() || process.env.AUTH_JWT_ISSUER?.trim() || undefined,
    audience: readArg("--aud")?.trim() || process.env.AUTH_JWT_AUDIENCE?.trim() || undefined,
    roleClaim: readArg("--role-claim")?.trim() || process.env.AUTH_JWT_ROLE_CLAIM?.trim() || "role"
  };
}

function mintToken(options: CliOptions, secret: string): { token: string; payload: Record<string, unknown> } {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "HS256",
    typ: "JWT"
  } as const;
  const payload: Record<string, unknown> = {
    sub: options.sub,
    iat: now,
    exp: now + options.expiresInSeconds,
    [options.roleClaim]: options.role
  };
  if (options.issuer) {
    payload.iss = options.issuer;
  }
  if (options.audience) {
    payload.aud = options.audience;
  }

  const headerPart = base64UrlEncode(JSON.stringify(header));
  const payloadPart = base64UrlEncode(JSON.stringify(payload));
  const signaturePart = signHs256(`${headerPart}.${payloadPart}`, secret);
  return {
    token: `${headerPart}.${payloadPart}.${signaturePart}`,
    payload
  };
}

function main(): void {
  const secret = process.env.AUTH_JWT_SECRET?.trim();
  if (!secret) {
    throw new Error("AUTH_JWT_SECRET is required to mint HS256 test tokens.");
  }

  const options = parseOptions();
  const { token, payload } = mintToken(options, secret);

  console.info(JSON.stringify({ event: "mint_test_jwt", payload }, null, 2));
  console.info("");
  console.info("TOKEN:");
  console.info(token);
  console.info("");
  console.info("PowerShell example:");
  console.info(`$env:VITE_AUTH_TOKEN='${token}'`);
}

main();

