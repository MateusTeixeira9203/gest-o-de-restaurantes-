// Shared guards. run-a4-baseline uses the operator-authorized repository environment loader.
export const DB_HOST = 'ep-square-dawn-b6qhiaxp';
export const SLUG = 'cantina-modelo';
export const EVIDENCE_ROOT = 'C:\\Users\\mateu\\Desktop\\Evidencias\\Restrio';

export function guard(mode) {
  if (process.env.RESTRIO_QA_RUN !== mode) throw new Error(`Opt-in required: RESTRIO_QA_RUN=${mode}`);
  if (process.env.QA_RESTAURANT_SLUG !== SLUG) throw new Error('Only cantina-modelo is allowed');
  // Explicit operator attestation; this does NOT inspect the running server configuration.
  if (process.env.QA_DB_HOST !== DB_HOST) throw new Error('Confirm the approved Neon endpoint before running');
  const base = new URL(process.env.QA_BASE_URL || 'http://localhost:3001');
  if (!['localhost', '127.0.0.1'].includes(base.hostname) || base.protocol !== 'http:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) {
    throw new Error('Only a local HTTP server origin is allowed');
  }
  return base.origin;
}

export function assertDatabaseTarget(connectionString) {
  const target = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      !new RegExp(`^${DB_HOST}(?:-pooler)?\\.[a-z0-9.-]+\\.neon\\.tech$`).test(target.hostname)) {
    throw new Error('Database endpoint refused');
  }
}

export async function assertCantina(client) {
  const result = await client.query('SELECT id FROM restaurants WHERE slug=$1', [SLUG]);
  if (result.rows.length !== 1) throw new Error('Cantina not found uniquely');
  return result.rows[0].id;
}
