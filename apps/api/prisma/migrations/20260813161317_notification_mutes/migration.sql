-- CreateTable
CREATE TABLE "notification_mutes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "notification_kind" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_mutes_user_id_idx" ON "notification_mutes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_mutes_user_id_kind_key" ON "notification_mutes"("user_id", "kind");

-- AddForeignKey
ALTER TABLE "notification_mutes" ADD CONSTRAINT "notification_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
