const test = require("node:test");
const assert = require("node:assert/strict");
const { createCredentialEncryption } = require("../src/credential-encryption");

test("credential adapter delegates encryption to Electron safeStorage", async () => {
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`sealed:${value}`),
    decryptString: (value) => value.toString().replace(/^sealed:/, ""),
  };
  const encryption = createCredentialEncryption(safeStorage);
  assert.equal(await encryption.isAvailable(), true);
  const ciphertext = await encryption.encrypt("secret");
  assert.ok(ciphertext instanceof Uint8Array);
  assert.equal(await encryption.decrypt(ciphertext), "secret");
});
