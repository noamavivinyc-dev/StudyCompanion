function createCredentialEncryption(safeStorage) {
  return {
    id: "electron.safe-storage.v1",
    isAvailable() {
      return safeStorage.isEncryptionAvailable();
    },
    encrypt(plaintext) {
      return new Uint8Array(safeStorage.encryptString(plaintext));
    },
    decrypt(ciphertext) {
      return safeStorage.decryptString(Buffer.from(ciphertext));
    },
  };
}

module.exports = { createCredentialEncryption };
