-- DropIndex
DROP INDEX "tax_rules_organizationId_code_countryCode_validFrom_key";

-- CreateIndex
CREATE UNIQUE INDEX "tax_rules_organizationId_code_countryCode_regionCode_applie_key" ON "tax_rules"("organizationId", "code", "countryCode", "regionCode", "appliesToCategory", "validFrom");
