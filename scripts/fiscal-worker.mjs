// For an authenticated scheduler. No drafts or production activation are created here.
const url = new URL(
  "/api/internal/fiscal-queue",
  process.env.FISCAL_APP_URL || "http://127.0.0.1:3100",
);
if (
  url.protocol !== "https:" &&
  !["localhost", "127.0.0.1"].includes(url.hostname)
)
  throw new Error("Use HTTPS fora do ambiente local.");
const secret = process.env.FISCAL_WORKER_SECRET;
if (!secret || secret.length < 32)
  throw new Error("FISCAL_WORKER_SECRET não configurado.");
const response = await fetch(url, {
  method: "POST",
  headers: { authorization: `Bearer ${secret}` },
  redirect: "error",
  signal: AbortSignal.timeout(185000),
});
if (!response.ok)
  throw new Error(`Fila fiscal indisponível (${response.status}).`);
console.log(JSON.stringify(await response.json()));
