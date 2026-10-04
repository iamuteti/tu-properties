-- CreateTable
CREATE TABLE "notification_channel_configs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "provider" TEXT NOT NULL,
    "credentialsEncrypted" TEXT NOT NULL,
    "settings" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channel_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_channel_configs_organizationId_idx" ON "notification_channel_configs"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channel_configs_organizationId_channel_key" ON "notification_channel_configs"("organizationId", "channel");

-- AddForeignKey
ALTER TABLE "notification_channel_configs" ADD CONSTRAINT "notification_channel_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
