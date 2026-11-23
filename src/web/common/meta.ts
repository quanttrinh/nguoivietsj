function getMeta(name: string): string | null | undefined {
  return document
    .querySelector(`meta[name="${name}"]`)
    ?.getAttribute('content');
}

var storedNonce: string | undefined;

function setNonce(nonce: string | undefined): void {
  storedNonce = nonce;
}

function getNonce(): string | undefined {
  return storedNonce;
}

export { getMeta, setNonce, getNonce };
