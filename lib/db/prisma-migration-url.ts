const RESTRICTED_RUNTIME_LOGINS = new Set<string>([
  "erp_app_login",
  "erp_auth_login",
  "erp_worker_login",
  "erp_super_admin_login",
]);

const NON_DB_PRISMA_COMMANDS = new Set<string>([
  "generate",
  "validate",
  "format",
  "version",
]);

const CODEGEN_PLACEHOLDER_URL =
  "postgresql://prisma-codegen-only@localhost:5432/postgres";

function extractPrismaSubcommand(argv: readonly string[]): string | null {
  const prismaIdx = argv.findIndex(
    (arg) =>
      /(^|[\\/])prisma(\.(cmd|exe|js|mjs|cjs))?$/i.test(arg) ||
      /[\\/]prisma[\\/]build[\\/]index\.(js|mjs|cjs)$/i.test(arg)
  );
  const startIdx = prismaIdx >= 0 ? prismaIdx + 1 : 0;

  for (let i = startIdx; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token) continue;
    if (token === "-v" || token === "--version") {
      return "version";
    }
    if (token.startsWith("-")) continue;
    return token.toLowerCase();
  }

  return null;
}

export function isNonDatabasePrismaCommand(argv: readonly string[]): boolean {
  const subcommand = extractPrismaSubcommand(argv);
  return subcommand !== null && NON_DB_PRISMA_COMMANDS.has(subcommand);
}

function parsePostgresUrl(rawUrl: string, sourceLabel: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      `Configuration error: ${sourceLabel} is not a valid PostgreSQL connection URL.`
    );
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `Configuration error: ${sourceLabel} must use postgresql:// or postgres:// scheme.`
    );
  }

  return parsed;
}

function isRestrictedRuntimeLogin(username: string): boolean {
  for (const role of RESTRICTED_RUNTIME_LOGINS) {
    if (username === role || username.startsWith(`${role}.`)) {
      return true;
    }
  }
  return false;
}

function validateSafeMigrationTarget(parsed: URL, sourceLabel: string): void {
  if (parsed.port === "6543") {
    throw new Error(
      `Configuration error: ${sourceLabel} must not use Transaction Mode pooler port 6543 for Prisma migrations.`
    );
  }

  const hasPgBouncerEnabled = Array.from(parsed.searchParams.entries()).some(
    ([key, value]) =>
      key.trim().toLowerCase() === "pgbouncer" &&
      value.trim().toLowerCase() === "true"
  );

  if (hasPgBouncerEnabled) {
    throw new Error(
      `Configuration error: ${sourceLabel} must not enable pgbouncer=true for Prisma migrations.`
    );
  }

  let username = "";
  try {
    username = decodeURIComponent(parsed.username || "").toLowerCase();
  } catch {
    throw new Error(
      `Configuration error: ${sourceLabel} contains an invalid username encoding.`
    );
  }

  if (isRestrictedRuntimeLogin(username)) {
    throw new Error(
      `Configuration error: ${sourceLabel} must not use a restricted runtime login identity.`
    );
  }
}

/**
 * Resolves the Prisma CLI datasource URL fail-closed:
 * - Non-DB commands (`generate`, `validate`, `format`, `version`) work without DIRECT_MIGRATION_URL.
 * - DB/migration commands require DIRECT_MIGRATION_URL in staging/prod and never fall back
 *   to remote DATABASE_URL, port 6543, pgbouncer=true, or restricted runtime logins.
 */
export function resolvePrismaDatasourceUrl(
  env: Record<string, string | undefined>,
  argv: readonly string[] = []
): string {
  const directUrl = env.DIRECT_MIGRATION_URL?.trim();
  const runtimeUrl = env.DATABASE_URL?.trim();

  if (isNonDatabasePrismaCommand(argv)) {
    return directUrl || runtimeUrl || CODEGEN_PLACEHOLDER_URL;
  }

  if (directUrl) {
    const parsedDirect = parsePostgresUrl(directUrl, "DIRECT_MIGRATION_URL");
    validateSafeMigrationTarget(parsedDirect, "DIRECT_MIGRATION_URL");
    return directUrl;
  }

  const isStagingOrProd =
    env.NODE_ENV === "production" ||
    env.APP_ENV?.toLowerCase() === "staging" ||
    Boolean(env.VERCEL_ENV);

  if (isStagingOrProd) {
    throw new Error(
      "Configuration error: DIRECT_MIGRATION_URL is required for Prisma database and migration commands in staging/production."
    );
  }

  if (!runtimeUrl) {
    throw new Error(
      "Configuration error: DIRECT_MIGRATION_URL is required for Prisma database and migration commands."
    );
  }

  const parsedFallback = parsePostgresUrl(runtimeUrl, "DATABASE_URL");
  const host = parsedFallback.hostname.toLowerCase();
  const isLocalhost = host === "localhost" || host === "127.0.0.1";

  if (!isLocalhost) {
    throw new Error(
      "Configuration error: DIRECT_MIGRATION_URL is required; remote DATABASE_URL cannot be used as an implicit migration fallback."
    );
  }

  validateSafeMigrationTarget(parsedFallback, "DATABASE_URL");
  return runtimeUrl;
}
