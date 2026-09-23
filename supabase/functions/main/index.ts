import * as jose from "https://deno.land/x/jose@v4.14.4/index.ts";

console.log("main function started");

const JWT_SECRET = Deno.env.get("JWT_SECRET");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const VERIFY_JWT = Deno.env.get("VERIFY_JWT") === "true";
const DEFAULT_WORKER_TIMEOUT_MS = 60_000;
const DOCUMENT_WORKER_TIMEOUT_MS = 300_000;
const LONG_RUNNING_FUNCTIONS = new Set([
  "generate-document",
  "generate-protocol-document",
]);

let SUPABASE_JWT_KEYS: ReturnType<typeof jose.createRemoteJWKSet> | null = null;
if (SUPABASE_URL) {
  try {
    SUPABASE_JWT_KEYS = jose.createRemoteJWKSet(
      new URL("/auth/v1/.well-known/jwks.json", SUPABASE_URL),
    );
  } catch (e) {
    console.error("Failed to configure JWKS from SUPABASE_URL:", e);
  }
}

function getAuthToken(req: Request): string {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) throw new Error("Missing authorization header");

  const [bearer, token] = authHeader.split(" ");
  if (bearer !== "Bearer" || !token) {
    throw new Error("Authorization header must use Bearer authentication");
  }
  return token;
}

async function isValidLegacyJWT(jwt: string): Promise<boolean> {
  if (!JWT_SECRET) {
    console.error("JWT_SECRET is not available for HS256 token verification");
    return false;
  }

  try {
    await jose.jwtVerify(jwt, new TextEncoder().encode(JWT_SECRET));
    return true;
  } catch (e) {
    console.error("Symmetric JWT verification error:", e);
    return false;
  }
}

async function isValidAsymmetricJWT(jwt: string): Promise<boolean> {
  if (!SUPABASE_JWT_KEYS) {
    console.error("JWKS is not available for asymmetric token verification");
    return false;
  }

  try {
    await jose.jwtVerify(jwt, SUPABASE_JWT_KEYS);
    return true;
  } catch (e) {
    console.error("Asymmetric JWT verification error:", e);
    return false;
  }
}

async function isValidJWT(jwt: string): Promise<boolean> {
  const { alg } = jose.decodeProtectedHeader(jwt);
  if (alg === "HS256") return await isValidLegacyJWT(jwt);
  if (alg === "ES256" || alg === "RS256") return await isValidAsymmetricJWT(jwt);
  return false;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && VERIFY_JWT) {
    try {
      const token = getAuthToken(req);
      if (!await isValidJWT(token)) {
        return new Response(JSON.stringify({ msg: "Invalid JWT" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ msg: message }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const url = new URL(req.url);
  const serviceName = url.pathname.split("/")[1];
  if (!serviceName) {
    return new Response(JSON.stringify({ msg: "Missing function name" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const servicePath = `/home/deno/functions/${serviceName}`;
  const workerTimeoutMs = LONG_RUNNING_FUNCTIONS.has(serviceName)
    ? DOCUMENT_WORKER_TIMEOUT_MS
    : DEFAULT_WORKER_TIMEOUT_MS;
  const env = Deno.env.toObject();

  console.error(`serving the request with ${servicePath}`);

  try {
    const worker = await EdgeRuntime.userWorkers.create({
      servicePath,
      memoryLimitMb: 150,
      workerTimeoutMs,
      noModuleCache: false,
      importMapPath: null,
      envVars: Object.entries(env),
    });
    return await worker.fetch(req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ msg: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
