-- Rename the per-organization module key `leases` to `agreements`.
--
-- The key names the module, and the module is agreements: a lease is one kind of
-- agreement — the other being a rental/residential letting — and the table
-- (`agreements`), the routes (`/agreements`) and the RBAC matrix key
-- (`agreements`) have all said so since the Module 5 rename. Only the
-- enablement key was left behind as `leases`, which is how the sidebar and the
-- route guard ended up speaking different languages about the same module: the
-- route map looked for `agreements` while the subscription held `leases`, so
-- every non-super-admin was redirected off /agreements by the module guard.
--
-- Data-preserving: the array is rewritten in place. No row is dropped, added
-- or reordered, and an organization that never had the key keeps not having
-- it. `array_replace` is used rather than a rebuild so the stored order — the
-- order the module picker renders — is untouched.

UPDATE "subscriptions"
SET "enabledModules" = array_replace("enabledModules", 'leases', 'agreements')
WHERE 'leases' = ANY("enabledModules");
