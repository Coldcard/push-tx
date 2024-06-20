import { Transaction } from 'bitcoinjs-lib';
import { Buffer } from 'buffer';
import { BLOCK_EXPLORER_CONFIG, MESSAGE_ICONS, TX_API_URLS } from './config';
import './style.css';
import { MempoolTxData, Network } from './types';

/**
 * Helper for awaiting either the return value or error of a promise.
 * Very useful for avoiding endless try/catch nesting and scoping hell.
 */
async function collect<T>(promise: Promise<T>): Promise<[null, T] | [Error, null]> {
  try {
    return [null, await promise];
  } catch (err) {
    if (err instanceof Error) {
      return [err, null];
    } else if (typeof err === 'string') {
      return [new Error(err), null];
    }

    return [new Error(), null];
  }
}

/**
 * Convert a base64url string to a Uint8Array
 */
function b64UrlToBytes(base64Url: string): Uint8Array {
  const base64 = base64Url
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
  const binaryString = atob(base64);
  return new Uint8Array([...binaryString].map((char) => char.charCodeAt(0)));
}

/**
 * Custom error for fetchSafe below.
 */
class FetchStatusError extends Error {
  url: string;
  status: number;
  statusText: string;
  body: string | null;

  constructor(url: string, status: number, statusText: string, body: string | null) {
    super();
    this.url = url;
    this.name = 'FetchStatusError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

/**
 * Wrapper around fetch that throws an error if the response is not 2xx.
 */
const fetchSafe: typeof fetch = async (input, init) => {
  const resp = await fetch(input, init);

  if (!resp.ok) {
    const [_, body] = await collect(resp.text());
    throw new FetchStatusError(input.toString(), resp.status, resp.statusText, body);
  }

  return resp;
};

/**
 * Send a transaction to some providers:
 * - Currently mempool.space and blockstream.info, perhaps more in the future
 * - Supporting mainnet and testnet
 */
async function pushTx(tx: Transaction, network: Network): Promise<string> {
  if (network !== 'BTC' && network !== 'XTN') {
    throw new Error('Unsupported network: ' + network);
  }

  const urls = TX_API_URLS[network];

  const promises = urls.map((url) => fetchSafe(url, { method: 'POST', body: tx.toHex() }));

  const [err, txid] = await collect(Promise.any(promises).then((res) => res.text()));

  if (txid) {
    return txid;
  }

  if (err instanceof AggregateError) {
    const fetchStatusErrors = err.errors.filter(
      (e): e is FetchStatusError => e instanceof FetchStatusError
    );

    if (fetchStatusErrors.length > 0) {
      let errMsg = `
        <p>The transaction was rejected by all providers:</p>

        <ul>
      `;

      fetchStatusErrors.forEach((e) => {
        errMsg += `<li>${e.url}: ${e.body}</li>`;
      });

      errMsg += `</ul>`;

      throw new Error(errMsg);
    }
  }

  throw new Error(
    `<p>Could not connect to any push servers. Make sure you are connected to the Internet and try again.</p>`
  );
}

/**
 * Parse the transaction data and network from the URL fragment
 * @param fragment - The URL fragment, e.g. #t=base64tx&c=base64checksum&n=XTN
 */
async function parseFragment(fragment: string) {
  if (fragment[0] === '#') {
    fragment = fragment.slice(1);
  }

  const params = new URLSearchParams(fragment);

  const t = params.get('t');
  const c = params.get('c');
  const n = params.get('n') || 'BTC';

  if (!t) {
    throw new Error('Invalid URL - missing transaction.');
  }

  if (!c || c.length !== 11) {
    throw new Error('Invalid URL - missing or incomplete checksum. The URL is probably truncated');
  }

  let network: Network;

  if (n === 'BTC' || n === 'XTN') {
    network = n;
  } else if (n === 'XRT') {
    throw new Error('Regtest transactions are not supported.');
  } else {
    throw new Error(`Invalid URL. The network "${n}" is not recognized.`);
  }

  let txBytes: Uint8Array;
  let checkBytes: Uint8Array;

  try {
    txBytes = b64UrlToBytes(t);
    checkBytes = b64UrlToBytes(c);
  } catch (err) {
    throw new Error('Invalid URL encoding. The URL is probably corrupted.');
  }

  const txHash = new Uint8Array(await crypto.subtle.digest('SHA-256', txBytes));

  if (!checkBytes.every((byte, i) => byte === txHash[i + 24])) {
    throw new Error('Checksum mismatch in URL. Some bytes corrupted in transit. Try again.');
  }

  const tx = Transaction.fromBuffer(Buffer.from(txBytes));

  return {
    tx,
    network,
  };
}

/**
 * Fetch the transaction details from mempool/blockstream to render useful information
 * that we can't (easily) get from the transaction itself, e.g. the input and output addresses
 * - Cancel other requests once the first one comes back OK.
 */
async function fetchTxData(txid: string, network: Network): Promise<MempoolTxData> {
  if (network !== 'BTC' && network !== 'XTN') {
    throw new Error('Unsupported network: ' + network);
  }

  const urls = TX_API_URLS[network];

  const promises = urls.map((url) => fetchSafe(url + '/' + txid).then((resp) => resp.json()));

  return await Promise.any(promises);
}

/**
 * Get the HTML for the transaction details that can be rendered on the page.
 */
function renderTxDetails(txData: MempoolTxData): string {
  const inputRows = txData.vin
    .map((input) => {
      return `
        <tr>
          <td>
            <span class="address">
              <span>${input.prevout.scriptpubkey_address.slice(0, -8)}</span>
              <span>${input.prevout.scriptpubkey_address.slice(-8)}</span>
            </span>
          </td>
          <td>
            <span class="value">${(input.prevout.value / 1e8).toFixed(8)}</span>
          </td>
        </tr>
      `;
    })
    .join('');

  const outputRows = txData.vout
    .map((output) => {
      return `
        <tr>
          <td>
            <span class="address">
              <span>${output.scriptpubkey_address.slice(0, -8)}</span>
              <span>${output.scriptpubkey_address.slice(-8)}</span>
            </span>
          </td>
          <td>
            <span class="value">${(output.value / 1e8).toFixed(8)}</span>
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div class="pushtx-details">
      <div class="inputs">
        <table>
          <thead>
            <tr>
              <th>Inputs</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${inputRows}
          </tbody>
        </table>
      </div>

      <div class="outputs">
        <table>
          <thead>
            <tr>
              <th>Outputs</th>
              <th></th>
            </tr>
          </thead>

          <tbody>
            ${outputRows}
          </tbody>
        </table>
      </div>

      <div class="fee">
        <strong>Fee:</strong> <span class="value">${(txData.fee / 1e8).toFixed(8)}</span>
      </div>
    </div>
  `;
}

/**
 * Get the HTML for a message box that can be rendered on the page.
 * @param type - The type of message, e.g. 'success', 'error', 'info'
 * @param message - The message to display - can be HTML
 */
function renderMessage(type: 'success' | 'error' | 'info' | 'progress', message: string): string {
  const icon = MESSAGE_ICONS[type];

  return `
    <div class="pushtx-message pushtx-message--${type}" role="alert">
      ${icon}
      <div>${message}</div>
    </div>
  `;
}

/**
 * For testing - convert an exisiting HEX transaction to a URL fragment
 */
async function txToUrlFragment(hex: string, network: Network) {
  const txBytes = new Uint8Array(hex.match(/.{2}/g)!.map((byte) => parseInt(byte, 16)));
  const txHash = new Uint8Array(await crypto.subtle.digest('SHA-256', txBytes));

  const tx = btoa(String.fromCharCode(...txBytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  const check = btoa(String.fromCharCode(...txHash.slice(24)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  let fragment = `#t=${tx}&c=${check}`;

  if (network) {
    fragment += `&n=${network}`;
  }
}

async function run() {
  const messageArea = document.querySelector<HTMLDivElement>('.pushtx-message-area');
  const detailsArea = document.querySelector<HTMLDivElement>('.pushtx-details-area');

  if (!messageArea || !detailsArea) {
    throw new Error('Need message and details areas in HTML.');
  }

  messageArea.innerHTML = '';
  detailsArea.innerHTML = '';

  if (!window.location.hash) {
    const path = window.location.origin + window.location.pathname;

    const msg = `
      <p><strong>Did you get here by accident?</strong></p>
      <p>
        This page is meant to be loaded together with transaction data using the
        <strong>COLDCARD NFC Push TX feature</strong>. The complete URL should look something like this (but longer):
      </p>

      <p><code>${path}#t=AgAAAAMNCxXtp2GVYVhkRXHLMmdZFs4p3kbFK ⋯ ABf&c=uiSVRda-1tw</code></p>
    `;

    messageArea.innerHTML = renderMessage('info', msg);
    return;
  }

  messageArea.innerHTML = renderMessage('progress', 'Sending transaction, please wait...');

  const [parseErr, parseResult] = await collect(parseFragment(window.location.hash));

  if (parseErr) {
    messageArea.innerHTML = renderMessage('error', parseErr.message);
    return;
  }

  const { tx, network } = parseResult;

  const txid = tx.getId();

  const [pushErr, pushResult] = await collect(pushTx(tx, network));

  // XXX - sometimes we get something like `{"code":-25,"message":"bad-txns-inputs-missingorspent"}`
  // but the transaction is actually confirmed, so:
  // - try to fetch the TX details by ID, even if pushing failed
  // - if it's found, show a green message and say it's pending or confirmed
  const [mempoolErr, mempoolTxData] = await collect(fetchTxData(txid, network));

  if (pushResult || mempoolTxData) {
    // push was successful and/or we got the TX details back
    const msg = mempoolTxData?.status.confirmed
      ? 'This transaction has already been confirmed.'
      : 'The transaction has been sent and is waiting to be confirmed.';

    const listHtml = BLOCK_EXPLORER_CONFIG[network]
      .map(
        ([name, url]) =>
          `<li><a href="${url}${txid}" target="_blank" rel="noopener">${name}</a></li>`
      )
      .join('');

    messageArea.innerHTML = renderMessage(
      'success',
      `<p>${msg} Transaction ID:</p>
    
        <p class="txid">${txid}</p>
    
        <p>Verify on a block explorer:</p>
    
        <ul>${listHtml}</ul>
        `
    );

    if (mempoolTxData) {
      detailsArea.innerHTML = renderTxDetails(mempoolTxData);
    }

    return;
  }

  if (pushErr && mempoolErr) {
    // pushing failed and we also couldn't fetch the TX details
    messageArea.innerHTML = renderMessage('error', pushErr.message);
  } else if (mempoolErr) {
    messageArea.innerHTML = renderMessage('error', mempoolErr.message);
    return;
  }
}

run();

window.addEventListener('hashchange', run);
