import assert from "node:assert/strict";
import http from "node:http";
import { randomUUID, randomBytes, scryptSync } from "node:crypto";
import { connect } from "../scripts/database.mjs";
const db = await connect(),
  base = process.env.TEST_BASE_URL || "http://localhost:3000";
const id = randomUUID(),
  staffA = randomUUID(),
  staffB = randomUUID(),
  product = randomUUID(),
  variant = randomUUID();
const prefix = `QA-TENANT-${id.slice(0, 8)}`,
  host = `${prefix.toLowerCase()}.test`;
let source;
const pinA = "872451",
  pinB = "632948";
async function req(
  path,
  body,
  hostname,
  cookie,
  method = body ? "POST" : "GET",
) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      new URL(base + path),
      {
        method,
        headers: {
          "content-type": "application/json",
          "idempotency-key": randomUUID(),
          ...(hostname ? { host: hostname } : {}),
          ...(cookie ? { cookie } : {}),
        },
      },
      (response) => {
        let text = "";
        response.on("data", (chunk) => (text += chunk));
        response.on("end", () => {
          try {
            resolve({
              status: response.statusCode,
              body: response.headers["content-type"]?.includes("application/json") ? JSON.parse(text) : text,
              cookie: response.headers["set-cookie"]?.[0]?.split(";")[0],
            });
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    request.on("error", reject);
    request.end(body ? JSON.stringify(body) : undefined);
  });
}
try {
  if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname))
    throw new Error("Teste permitido somente contra servidor local.");
  source = (
    await db.query("SELECT id FROM restaurants WHERE slug=$1", [
      process.env.RESTAURANT_SLUG || "patos-lanches",
    ])
  ).rows[0].id;
  await db.query(
    "INSERT INTO restaurants(id,slug,name,plan) VALUES($1,$2,$2,'essential')",
    [id, prefix],
  );
  await db.query(
    "INSERT INTO restaurant_domains(hostname,restaurant_id) VALUES($1,$2)",
    [host, id],
  );
  await db.query("INSERT INTO inventory_settings(restaurant_id) VALUES($1)", [
    id,
  ]);
  await db.query("INSERT INTO restaurant_counters(restaurant_id) VALUES($1)", [
    id,
  ]);
  await db.query(
    "INSERT INTO finance_accounts(restaurant_id,code,name,kind) SELECT $1,code,name,kind FROM finance_accounts WHERE restaurant_id=$2",
    [id, source],
  );
  for (const [sid, rid, pin] of [
    [staffA, source, pinA],
    [staffB, id, pinB],
  ]) {
    const salt = randomBytes(16).toString("hex");
    await db.query(
      "INSERT INTO staff_members(id,restaurant_id,name,role,pin_salt,pin_hash) VALUES($1,$2,$3,'manager',$4,$5)",
      [sid, rid, prefix, salt, scryptSync(pin, salt, 64).toString("hex")],
    );
  }
  await db.query(
    "INSERT INTO menu_products(id,restaurant_id,name,category,kitchen_sector) VALUES($1,$2,$3,'QA','QA')",
    [product, source, prefix],
  );
  await db.query(
    "INSERT INTO menu_variants(id,product_id,name,price_cents) VALUES($1,$2,'QA',100)",
    [variant, product],
  );
  const home = await req("/",null,host);
  assert.equal(home.status,200);assert.ok(home.body.includes(prefix));assert.ok(!home.body.includes("Patos Lanches"));
  const menu = await req("/api/public/menu", null, host);
  assert.equal(menu.status, 200);
  assert.equal(menu.body.restaurant.name, prefix);
  assert.equal(menu.body.products.length, 0);
  assert.equal(menu.body.branding.logoUrl, null);
  assert.equal(
    (await req("/api/public/menu", null, "unknown-tenant.test")).status,
    503,
  );
  const a = await req("/api/auth/login", { username: prefix, password: pinA });
  assert.equal(a.status, 200);
  assert.equal(
    (await req("/api/auth/login", { username: prefix, password: pinA }, host))
      .status,
    401,
  );
  const b = await req(
    "/api/auth/login",
    { username: prefix, password: pinB },
    host,
  );
  assert.equal(b.status, 200);
  assert.equal(
    (await req("/api/operations/state", null, host, a.cookie)).status,
    401,
  );
  assert.equal(
    (
      await req(
        "/api/operations/products/" + product,
        { available: false },
        host,
        b.cookie,
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await req(
        "/api/public/orders",
        {
          source: "public_menu",
          fulfillment: "pickup",
          items: [{ productId: product, variantId: variant, quantity: 1 }],
        },
        host,
      )
    ).status,
    400,
  );
  assert.equal(
    (await req("/api/operations/finance", null, host, b.cookie)).status,
    400,
  );
  assert.equal(
    (await req("/api/operations/finance?cash=1", null, host, b.cookie)).status,
    200,
  );
  assert.equal(
    (
      await db.query("SELECT available FROM menu_products WHERE id=$1", [
        product,
      ])
    ).rows[0].available,
    true,
  );
  console.log(
    "PASS: domain resolution, unknown-domain denial, independent identities, tenant-bound cookies, cross-tenant product/write rejection, Essential backend gating and cash availability.",
  );
} finally {
  await db.query(
    "DELETE FROM authentication_attempts WHERE identity_hash=encode(sha256($1::bytea),'hex')",
    [prefix.toLowerCase()],
  );
  await db.query("DELETE FROM staff_members WHERE id=ANY($1::uuid[])", [
    [staffA, staffB],
  ]);
  await db.query("DELETE FROM menu_products WHERE id=$1", [product]);
  await db.query("DELETE FROM finance_accounts WHERE restaurant_id=$1", [id]);
  await db.query("DELETE FROM restaurants WHERE id=$1", [id]);
  await db.end();
}
