(function () {
  'use strict';

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  function bytesToBase64Url(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  }

  async function compress(bytes) {
    if (!('CompressionStream' in window)) return { bytes, method: 'n' };
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return { bytes: new Uint8Array(await new Response(stream).arrayBuffer()), method: 'd' };
  }

  async function decompress(bytes, method) {
    if (method === 'n') return bytes;
    if (!('DecompressionStream' in window)) throw new Error('This browser cannot decompress the secure link. Please use a current version of Chrome, Edge, Firefox, or Safari.');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  async function pack(payload) {
    if (!window.crypto?.subtle) throw new Error('Secure link generation needs HTTPS or localhost.');
    const json = JSON.stringify(payload);
    const compressed = await compress(encoder.encode(json));
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
    const rawKey = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed.bytes));
    return ['v1', compressed.method, bytesToBase64Url(iv), bytesToBase64Url(encrypted), bytesToBase64Url(rawKey)].join('.');
  }

  async function unpack(token) {
    if (!window.crypto?.subtle) throw new Error('Secure link opening needs HTTPS or localhost.');
    const [version, method, encodedIv, encodedData, encodedKey, ...extra] = token.split('.');
    if (version !== 'v1' || !['d', 'n'].includes(method) || !encodedIv || !encodedData || !encodedKey || extra.length) {
      throw new Error('This referral link is incomplete or has an unsupported format.');
    }
    const key = await crypto.subtle.importKey('raw', base64UrlToBytes(encodedKey), 'AES-GCM', false, ['decrypt']);
    let decrypted;
    try {
      decrypted = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64UrlToBytes(encodedIv) }, key, base64UrlToBytes(encodedData)));
    } catch {
      throw new Error('This referral link is damaged or has been changed.');
    }
    const plain = await decompress(decrypted, method);
    return JSON.parse(decoder.decode(plain));
  }

  window.ReferralCodec = { pack, unpack };
})();
