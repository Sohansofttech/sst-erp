DO $$
BEGIN
  IF EXISTS (
    SELECT LOWER(email)
    FROM "users"
    WHERE email IS NOT NULL
    GROUP BY LOWER(email)
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot add users.email unique constraint: duplicate email addresses exist.';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key"
ON "users"(email);
