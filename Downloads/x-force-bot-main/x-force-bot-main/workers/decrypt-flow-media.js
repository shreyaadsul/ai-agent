import { parentPort, workerData } from "worker_threads";
import crypto from "crypto";

// Function to calculate SHA256 hash
const sha256 = (data) =>
  crypto.createHash("sha256").update(data).digest("base64");

// Function to validate HMAC-SHA256
const validateHMAC = (key, iv, ciphertext, hmac10) => {
  const hmac = crypto
    .createHmac("sha256", Buffer.from(key, "base64"))
    .update(Buffer.from(iv, "base64"))
    .update(ciphertext)
    .digest();
  return hmac.slice(0, 10).equals(hmac10);
};

// Function to decrypt AES-256-CBC
const decryptAES256CBC = (key, iv, ciphertext) => {
  const decipher = crypto.createDecipheriv(
    "aes-256-cbc",
    Buffer.from(key, "base64"),
    Buffer.from(iv, "base64")
  );
  let decrypted = decipher.update(ciphertext);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted;
};

// Function to remove PKCS7 padding
const removePadding = (buffer) => {
  const padding = buffer[buffer.length - 1];
  return buffer.slice(0, -padding);
};

(async () => {
  const {
    ciphertext,
    encryptionKey,
    hmacKey,
    iv,
    hmac10,
    plaintextHash,
    encryptedHash,
    cdnFile
  } = workerData;

  try {
    // Step 1: Validate SHA256(ciphertext + hmac10) == enc_hash
    const fileHash = sha256(cdnFile);

    if (fileHash !== encryptedHash) {
      parentPort.postMessage({
        error: "SHA256 validation of encrypted file failed.",
      });
      return;
    }

    // Step 2: Validate HMAC-SHA256
    if (!validateHMAC(hmacKey, iv, ciphertext, hmac10)) {
      parentPort.postMessage({ error: "HMAC-SHA256 validation failed." });
      return;
    }

    // Step 3: Decrypt the media content (AES-256-CBC)
    let decryptedMedia = decryptAES256CBC(encryptionKey, iv, ciphertext);

    // Step 4: Remove padding (PKCS7)
    decryptedMedia = removePadding(decryptedMedia);

    // Step 5: Validate decrypted media with SHA256
    // const mediaHash = sha256(decryptedMedia);
    //   if (mediaHash !== plaintextHash) {
    //     parentPort.postMessage({ error: 'Decrypted media SHA256 validation failed.' });
    //     return;
    //   }

    // Step 6: Send the decrypted media back to the main thread
    parentPort.postMessage({ success: true, decryptedMedia });
  } catch (error) {
    console.error(error);
    parentPort.postMessage({ error: error.message });
  }
})();
