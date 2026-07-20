// Token rotativo tipo TOTP basado en HMAC-SHA256 + ventana de tiempo.
// Compartido entre index.html (genera el QR) y fichada.html (verifica).
(function () {
  async function hmacSha256Hex(secret, message) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function currentBucket(periodSec) {
    return Math.floor(Date.now() / 1000 / periodSec);
  }

  async function buildToken(secret, periodSec) {
    const bucket = currentBucket(periodSec);
    const sig = (await hmacSha256Hex(secret, String(bucket))).slice(0, 16);
    return bucket + "." + sig;
  }

  async function verifyToken(token, secret, periodSec, tolerance) {
    if (typeof token !== "string") return false;
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const bucket = Number(parts[0]);
    const sig = parts[1];
    if (!Number.isInteger(bucket) || !sig) return false;
    const now = currentBucket(periodSec);
    if (Math.abs(now - bucket) > tolerance) return false;
    const expected = (await hmacSha256Hex(secret, String(bucket))).slice(0, 16);
    return constantTimeEquals(expected, sig);
  }

  function constantTimeEquals(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  function secondsUntilNextBucket(periodSec) {
    const nowSec = Date.now() / 1000;
    const nextBucketStart = (Math.floor(nowSec / periodSec) + 1) * periodSec;
    return nextBucketStart - nowSec;
  }

  window.FichadaToken = {
    buildToken: buildToken,
    verifyToken: verifyToken,
    secondsUntilNextBucket: secondsUntilNextBucket,
  };
})();
