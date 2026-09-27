// Historical statements can preserve different indentation and dollar-quote tags.
// Match SQL boundaries without changing quoted values or the SQL under test.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export function sqlIndexOf(sql: string, needle: string, from = 0): number {
  const pattern = needle.trim().split(/\s+/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
  const match = new RegExp(pattern, "i").exec(sql.slice(from));
  return match ? from + match.index : -1;
}

export function assertSqlMatch(sql: string, pattern: RegExp): void {
  assert.match(sql, new RegExp(pattern.source.replace(/ +/g, "\\s*"), pattern.flags));
}

export function assertSqlDoesNotMatch(sql: string, pattern: RegExp): void {
  assert.doesNotMatch(sql, new RegExp(pattern.source.replace(/ +/g, "\\s*"), pattern.flags));
}

export function assertRecordedMigration(file: string): void {
  const manifest = JSON.parse(readFileSync("docs/migration-reconciliation/20260927/manifest.json", "utf8")) as {
    decisions: { filename: string; rendered_file_sha256: string }[];
  };
  const entry = manifest.decisions.find(row => row.filename === path.basename(file));
  assert.ok(entry, "migration must have recorded remote evidence");
  assert.equal(createHash("sha256").update(readFileSync(file)).digest("hex"), entry.rendered_file_sha256);
}
