DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users"
    WHERE email IS NOT NULL
    GROUP BY LOWER(BTRIM(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add case-insensitive users.email uniqueness: duplicate case-insensitive email addresses exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE email IS NOT NULL
    GROUP BY LOWER(BTRIM(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add case-insensitive User.email uniqueness: duplicate case-insensitive email addresses exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_idx"
ON "users"(LOWER(BTRIM(email)));

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_lower_idx"
ON "User"(LOWER(BTRIM(email)));
