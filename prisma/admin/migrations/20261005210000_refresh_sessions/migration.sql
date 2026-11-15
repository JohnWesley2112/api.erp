-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "selected_tenant_id" INTEGER,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_session_tokens" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "rotated_from_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_session_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "refresh_sessions_user_id_revoked_at_idx" ON "refresh_sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "refresh_sessions_selected_tenant_id_idx" ON "refresh_sessions"("selected_tenant_id");

-- CreateIndex
CREATE INDEX "refresh_sessions_expires_at_idx" ON "refresh_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_session_tokens_token_hash_key" ON "refresh_session_tokens"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_session_tokens_rotated_from_id_key" ON "refresh_session_tokens"("rotated_from_id");

-- CreateIndex
CREATE INDEX "refresh_session_tokens_session_id_consumed_at_idx" ON "refresh_session_tokens"("session_id", "consumed_at");

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_selected_tenant_id_fkey" FOREIGN KEY ("selected_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_session_tokens" ADD CONSTRAINT "refresh_session_tokens_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "refresh_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_session_tokens" ADD CONSTRAINT "refresh_session_tokens_rotated_from_id_fkey" FOREIGN KEY ("rotated_from_id") REFERENCES "refresh_session_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
