// Same isolated PostgreSQL 17 schema/fixture builder; never accepts remote URLs.
// node scripts/verify-five-column-groups-sql.cjs <local-url> <schema-baseline.json>
process.argv.push("--column-groups");
require("./verify-five-news-column-sql.cjs");
