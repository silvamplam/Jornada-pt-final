import assert from "node:assert/strict";
import test from "node:test";

import { buildStoredZip } from "./zip-archive";

test("gera um ZIP store com nomes UTF-8 e diretório central", () => {
  const first = new TextEncoder().encode("imagem-um");
  const second = new TextEncoder().encode("relatório");
  const zip = buildStoredZip([
    { fileName: "01-record-imagem.jpg", bytes: first, modifiedAt: new Date(2026, 7, 1, 12, 30) },
    { fileName: "LEIA-ME.txt", bytes: second, modifiedAt: new Date(2026, 7, 1, 12, 30) },
  ]);
  const buffer = Buffer.from(zip);

  assert.equal(buffer.readUInt32LE(0), 0x04034b50);
  assert.equal(buffer.readUInt32LE(buffer.length - 22), 0x06054b50);
  assert.equal(buffer.readUInt16LE(buffer.length - 12), 2);
  assert.match(buffer.toString("utf8"), /01-record-imagem\.jpg/);
  assert.match(buffer.toString("utf8"), /LEIA-ME\.txt/);
});

test("rejeita ficheiros com travessia de diretórios", () => {
  assert.throws(
    () => buildStoredZip([{ fileName: "../imagem.jpg", bytes: new Uint8Array([1]) }]),
    /zip_entry_invalid/,
  );
});
