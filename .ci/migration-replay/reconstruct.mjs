// Reconstruct recorded migrations from the read-only production evidence.
// Never connects to a database. Original local content remains at the audited Git base.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const evidence = path.join(root, 'docs/migration-reconciliation/20260927');
const snapshot = JSON.parse(fs.readFileSync(path.join(evidence, 'remote-history.json'), 'utf8'));
const decisions = JSON.parse(fs.readFileSync(path.join(evidence, 'decisions.json'), 'utf8'));
const directory = path.join(root, 'supabase/migrations');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const manifest = [];
for (const entry of snapshot.entries) {
  const decision = decisions.find(row => row.version === entry.version);
  const filename = entry.version + '_' + entry.name + '.sql';
  // A newline prevents a trailing SQL comment from consuming the delimiter.
  // statements[] elements themselves are preserved byte for byte.
  const sql = entry.statements.map(statement => statement + '\n;\n').join('\n');
  const oldPath = decision.original_local_file && path.join(directory, decision.original_local_file);
  if (oldPath && decision.original_local_file !== filename && fs.existsSync(oldPath)) {
    fs.renameSync(oldPath, path.join(directory, filename));
  }
  fs.writeFileSync(path.join(directory, filename), sql, 'utf8');
  manifest.push({
    version: entry.version, name: entry.name, filename,
    recorded_joined_sql_md5: entry.sql_md5,
    statement_sha256: entry.statements.map(hash),
    rendered_file_sha256: hash(sql),
    original_local_file: decision.original_local_file,
    classification: decision.classification,
  });
}
const renames = decisions.filter(row => row.original_local_file &&
  row.original_local_file !== row.version + '_' + row.name + '.sql');
const tracked = execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8'}).split('\0').filter(Boolean);
const changedReferences = [];
for (const filename of tracked) {
  if (filename.startsWith('supabase/migrations/') || filename.startsWith('docs/migration-reconciliation/')) continue;
  if (!/\.(?:ts|tsx|js|mjs|cjs|py|sql|md|yml|yaml|json|sh|ps1)$/.test(filename)) continue;
  let original = fs.readFileSync(filename, 'utf8'), updated = original;
  for (const rename of renames) {
    updated = updated.replaceAll(rename.original_local_file.replace(/\.sql$/, ''),
      rename.version + '_' + rename.name);
  }
  if (updated !== original) {
    fs.writeFileSync(filename, updated, 'utf8');
    changedReferences.push(filename);
  }
}
fs.writeFileSync(path.join(evidence, 'manifest.json'), JSON.stringify({
  snapshot_base: snapshot.base,
  remote_count: snapshot.entries.length,
  decisions: manifest,
  reference_files_updated: changedReferences,
}, null, 2) + '\n');
console.log(JSON.stringify({reconstructed: manifest.length, renames: renames.length,
  references: changedReferences.length,
  migration_files: fs.readdirSync(directory).filter(file => file.endsWith('.sql')).length}));
