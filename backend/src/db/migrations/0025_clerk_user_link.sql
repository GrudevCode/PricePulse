ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "clerk_user_id" varchar(255);

CREATE UNIQUE INDEX IF NOT EXISTS "users_clerk_user_id_unique" ON "users" ("clerk_user_id");

ALTER TABLE "users"
ALTER COLUMN "password_hash" DROP NOT NULL;
