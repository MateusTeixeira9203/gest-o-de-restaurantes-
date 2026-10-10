import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { authorize } from "./contracts.ts";
import type { Actor, Environment, Json, Kind, Operation, Provider, Result } from "./contracts.ts";

function canonical(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}
function validatePayload(value: unknown, depth = 0): asserts value is Json {
  if (depth > 20) throw new Error("Conteúdo muito profundo.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) { value.forEach(v => validatePayload(v, depth + 1)); return; }
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Conteúdo inválido.");
  for (const [key, child] of Object.entries(value)) {
    if (/token|password|senha|secret|authorization|certificate|certificado|card_number|cvv|^pan$|^csc$|api.?key/i.test(key)) throw new Error("Credenciais não podem ser persistidas na operação.");
    validatePayload(child, depth + 1);
  }
}
export type Preparation = { restaurantId: string; environment: Environment; kind: Kind; provider: string; key: string; payload: Record<string, Json> };
// Internal repository: tenant must originate from authenticated server context, never request JSON.
export async function prepare(client: PoolClient, input: Preparation, actor: Actor): Promise<Operation> {
  authorize(input.kind, actor);
  if (!["fiscal", "payment"].includes(input.kind) || !["homologation", "production"].includes(input.environment)) throw new Error("Tipo/ambiente inválido.");
  if (!/^[a-z0-9_-]{1,60}$/.test(input.provider) || !input.key.trim() || input.key.length > 200) throw new Error("Referência inválida.");
  validatePayload(input.payload);
  const serialized = canonical(input.payload);
  if (Buffer.byteLength(serialized) > 128_000) throw new Error("Conteúdo muito grande.");
  const hash = createHash("sha256").update(input.provider + ":" + serialized).digest("hex");
  const id = randomUUID();
  await client.query(`INSERT INTO integration_operations(id,restaurant_id,environment,kind,provider,operation_key,reference,payload,payload_hash,created_by)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(restaurant_id,environment,kind,operation_key) DO NOTHING`,
  [id,input.restaurantId,input.environment,input.kind,input.provider,input.key,`gf_${id.replaceAll("-", "")}`,input.payload,hash,actor.name]);
  const row = (await client.query<Operation & {payload_hash: string}>(`SELECT * FROM integration_operations WHERE restaurant_id=$1 AND environment=$2 AND kind=$3 AND operation_key=$4`, [input.restaurantId,input.environment,input.kind,input.key])).rows[0];
  if (!row || row.payload_hash !== hash) throw new Error("A chave já foi usada com outro conteúdo ou provedor.");
  return row;
}
export async function readOperation(client: PoolClient, restaurantId: string, id: string) {
  return (await client.query<Operation>("SELECT * FROM integration_operations WHERE restaurant_id=$1 AND id=$2", [restaurantId,id])).rows[0] ?? null;
}
// One atomic UPDATE claims work; no transaction or row lock is held during network I/O.
export async function dispatch(client: PoolClient, restaurantId: string, id: string, provider: Provider): Promise<Operation | null> {
  if (!provider.enabled || provider.restaurantId !== restaurantId) throw new Error("Conector desabilitado ou de outro restaurante.");
  // Production activation is intentionally impossible until connector homologation and application wiring.
  if (provider.environment !== "homologation") throw new Error("Produção não habilitada nesta base.");
  const lease = randomUUID();
  const claimed = (await client.query<Operation & {first_attempt: boolean}>(`UPDATE integration_operations SET
    status='dispatching',lease_token=$3,lease_until=now()+interval '60 seconds',attempts=attempts+1,updated_at=now()
    WHERE restaurant_id=$1 AND id=$2 AND provider=$4 AND kind=$5 AND environment=$6
      AND status IN ('prepared','dispatching','unknown','pending') AND (lease_until IS NULL OR lease_until<now())
    RETURNING *,attempts=1 AS first_attempt`, [restaurantId,id,lease,provider.id,provider.kind,provider.environment])).rows[0];
  if (!claimed) return readOperation(client,restaurantId,id);
  let result: Result;
  try {
    result = claimed.first_attempt ? await provider.submit(claimed) : await provider.consult(claimed);
    if (!["unknown","pending","succeeded","failed","cancelled"].includes(result.status) || !/^[a-zA-Z0-9_.-]{1,100}$/.test(result.code)) throw new Error("Invalid normalized response");
    result = {status:result.status,code:result.code,...(result.externalId ? {externalId:result.externalId.slice(0,200)} : {})};
  } catch {
    // Never store raw errors: provider errors may contain credentials or fiscal personal data.
    result = {status:"unknown",code:"provider_result_unknown"};
  }
  await client.query(`UPDATE integration_operations SET status=$4,result=$5,lease_token=NULL,
    lease_until=CASE WHEN $4 IN ('pending','unknown') THEN now()+interval '30 seconds' ELSE NULL END,updated_at=now()
    WHERE restaurant_id=$1 AND id=$2 AND lease_token=$3`, [restaurantId,id,lease,result.status,result]);
  return readOperation(client,restaurantId,id);
}
