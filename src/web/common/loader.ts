// @ts-expect-error
import { decode as yencDecode } from 'simple-yenc';
import { setNonce } from './meta';

// Placeholders will be replaced during build
declare const __BUNDLER_JS_PAYLOAD__: string;
declare const __BUNDLER_CSS_PAYLOAD__: string;

async function decompressGzip(data: Uint8Array): Promise<string> {
  // Check browser support
  if (!('DecompressionStream' in window)) {
    throw new Error('DecompressionStream not supported in this browser');
  }

  const ds = new DecompressionStream('gzip');

  // Start reading from the readable stream before writing
  const responsePromise = new Response(ds.readable).arrayBuffer();

  // Write data to the writable stream
  const writer = ds.writable.getWriter();
  await writer.write(data);
  await writer.close();

  // Wait for the decompressed data
  const buffer = await responsePromise;

  return new TextDecoder().decode(buffer);
}

async function loadCompressedAssets(nonce?: string): Promise<void> {
  const JSPAYLOAD = __BUNDLER_JS_PAYLOAD__;
  const CSSPAYLOAD = __BUNDLER_CSS_PAYLOAD__;

  try {
    console.log('Loading compressed assets...');

    const decompressPromises = [];

    if (JSPAYLOAD) {
      decompressPromises.push(
        new Promise<string>(async (resolve, reject) => {
          try {
            const yencDecoded = yencDecode(JSPAYLOAD);
            resolve(await decompressGzip(yencDecoded));
          } catch (error) {
            reject(
              new Error(
                'JS decompression failed: ' +
                  (error instanceof Error ? error.message : String(error))
              )
            );
          }
        })
      );
    }

    if (CSSPAYLOAD) {
      decompressPromises.push(
        new Promise<string>(async (resolve, reject) => {
          try {
            const yencDecoded = yencDecode(CSSPAYLOAD);
            resolve(await decompressGzip(yencDecoded));
          } catch (error) {
            reject(
              new Error(
                'CSS decompression failed: ' +
                  (error instanceof Error ? error.message : String(error))
              )
            );
          }
        })
      );
    }

    const [jsPayload, cssPayload] = await Promise.all(decompressPromises);

    setNonce(nonce);

    // Load CSS first to prevent FOUC
    if (cssPayload) {
      const style = document.createElement('style');
      style.textContent = cssPayload;
      style.nonce = nonce;
      document.head.appendChild(style);
    }

    // Then load JavaScript
    if (jsPayload) {
      const script = document.createElement('script');
      script.type = 'module';
      script.nonce = nonce;
      script.textContent = jsPayload;

      // Add error handling
      script.onerror = (error) => {
        console.error('Failed to execute module script:', error);
      };

      document.head.appendChild(script);
    }

    console.log('Assets loaded successfully.');
  } catch (error) {
    console.error('Failed to load compressed assets:', error);

    // Display user-friendly error message (programmatic DOM injection)
    const container = document.createElement('div');
    container.style.padding = '20px';
    container.style.fontFamily =
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    container.style.textAlign = 'center';

    const title = document.createElement('h1');
    title.textContent = 'Failed to load application';

    const message = document.createElement('p');
    message.textContent = 'Your browser may not support required features.';

    const details = document.createElement('p');
    details.style.color = '#666';
    details.style.fontSize = '0.9em';
    details.textContent = `Error: ${error instanceof Error ? error.message : 'Unknown error'}`;

    container.appendChild(title);
    container.appendChild(message);
    container.appendChild(details);

    document.body.innerHTML = '';
    document.body.appendChild(container);
  }
}

// Start loading assets
loadCompressedAssets(document.currentScript?.nonce).then(() => {
  console.log('Loader finished execution.');
});
