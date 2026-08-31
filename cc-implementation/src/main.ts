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
 * Carries provider-specific rejection details so the UI can render them
 * as plain text instead of embedding them in an HTML string.
 */
class ProviderErrorsError extends Error {
  details: { url: string; body: string | null }[];

  constructor(details: { url: string; body: string | null }[]) {
    super('The transaction was rejected by all providers.');
    this.details = details;
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
      throw new ProviderErrorsError(
        fetchStatusErrors.map((e) => ({ url: e.url, body: e.body }))
      );
    }
  }

  throw new Error(
    'Could not connect to any push servers. Make sure you are connected to the Internet and try again.'
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
    throw new Error('Invalid URL. The network parameter is not recognized.');
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
 * Build a table row for an address/value pair, setting dynamic values via
 * textContent so API-returned strings are never interpreted as HTML.
 */
function createTxRow(address: string, value: number): HTMLTableRowElement {
  const row = document.createElement('tr');

  const addressCell = document.createElement('td');
  const addressSpan = document.createElement('span');
  addressSpan.className = 'address';
  const addressStart = document.createElement('span');
  addressStart.textContent = address.slice(0, -8);
  const addressEnd = document.createElement('span');
  addressEnd.textContent = address.slice(-8);
  addressSpan.appendChild(addressStart);
  addressSpan.appendChild(addressEnd);
  addressCell.appendChild(addressSpan);
  row.appendChild(addressCell);

  const valueCell = document.createElement('td');
  const valueSpan = document.createElement('span');
  valueSpan.className = 'value';
  valueSpan.textContent = (value / 1e8).toFixed(8);
  valueCell.appendChild(valueSpan);
  row.appendChild(valueCell);

  return row;
}

/**
 * Get the DOM element for the transaction details that can be rendered on the page.
 */
function renderTxDetails(txData: MempoolTxData): HTMLElement {
  const container = document.createElement('div');
  container.className = 'pushtx-details';

  const createTable = (title: string, rows: HTMLTableRowElement[]) => {
    const wrapper = document.createElement('div');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    const titleHeader = document.createElement('th');
    titleHeader.textContent = title;
    const emptyHeader = document.createElement('th');
    headerRow.appendChild(titleHeader);
    headerRow.appendChild(emptyHeader);
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    rows.forEach((row) => tbody.appendChild(row));
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  };

  const inputRows = txData.vin.map((input) =>
    createTxRow(input.prevout.scriptpubkey_address, input.prevout.value)
  );
  container.appendChild(createTable('Inputs', inputRows));

  const outputRows = txData.vout.map((output) =>
    createTxRow(output.scriptpubkey_address, output.value)
  );
  container.appendChild(createTable('Outputs', outputRows));

  const feeDiv = document.createElement('div');
  feeDiv.className = 'fee';
  const strong = document.createElement('strong');
  strong.textContent = 'Fee:';
  const feeSpan = document.createElement('span');
  feeSpan.className = 'value';
  feeSpan.textContent = (txData.fee / 1e8).toFixed(8);
  feeDiv.appendChild(strong);
  feeDiv.appendChild(document.createTextNode(' '));
  feeDiv.appendChild(feeSpan);
  container.appendChild(feeDiv);

  return container;
}

/**
 * Get a message box element that can be rendered on the page.
 * The caller supplies the content as a DOM Node/DocumentFragment; dynamic text
 * must be set via textContent before calling this helper.
 * @param type - The type of message, e.g. 'success', 'error', 'info'
 * @param content - The content to display inside the message box
 */
function renderMessage(
  type: 'success' | 'error' | 'info' | 'progress',
  content: Node
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = `pushtx-message pushtx-message--${type}`;
  wrapper.setAttribute('role', 'alert');

  const iconContainer = document.createElement('div');
  iconContainer.innerHTML = MESSAGE_ICONS[type];
  wrapper.appendChild(iconContainer);

  const contentContainer = document.createElement('div');
  contentContainer.appendChild(content);
  wrapper.appendChild(contentContainer);

  return wrapper;
}

/**
 * Convenience helper for messages that are plain text only.
 */
function textMessage(
  type: 'success' | 'error' | 'info' | 'progress',
  text: string
): HTMLElement {
  const fragment = document.createDocumentFragment();
  fragment.appendChild(document.createTextNode(text));
  return renderMessage(type, fragment);
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

  messageArea.replaceChildren();
  detailsArea.replaceChildren();

  if (!window.location.hash) {
    const path = window.location.origin + window.location.pathname;

    const fragment = document.createDocumentFragment();

    const p1 = document.createElement('p');
    const strong1 = document.createElement('strong');
    strong1.textContent = 'Did you get here by accident?';
    p1.appendChild(strong1);
    fragment.appendChild(p1);

    const p2 = document.createElement('p');
    p2.textContent =
      'This page is meant to be loaded together with transaction data using the ';
    const strong2 = document.createElement('strong');
    strong2.textContent = 'COLDCARD NFC Push TX feature';
    p2.appendChild(strong2);
    p2.appendChild(
      document.createTextNode(
        '. The complete URL should look something like this (but longer):'
      )
    );
    fragment.appendChild(p2);

    const p3 = document.createElement('p');
    const code = document.createElement('code');
    code.textContent = `${path}#t=AgAAAAMNCxXtp2GVYVhkRXHLMmdZFs4p3kbFK ⋯ ABf&c=uiSVRda-1tw`;
    p3.appendChild(code);
    fragment.appendChild(p3);

    messageArea.replaceChildren(renderMessage('info', fragment));
    return;
  }

  messageArea.replaceChildren(
    textMessage('progress', 'Sending transaction, please wait...')
  );

  const [parseErr, parseResult] = await collect(parseFragment(window.location.hash));

  if (parseErr) {
    messageArea.replaceChildren(textMessage('error', parseErr.message));
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

    const fragment = document.createDocumentFragment();

    const p1 = document.createElement('p');
    p1.textContent = `${msg} Transaction ID:`;
    fragment.appendChild(p1);

    const txidP = document.createElement('p');
    txidP.className = 'txid';
    txidP.textContent = txid;
    fragment.appendChild(txidP);

    const p2 = document.createElement('p');
    p2.textContent = 'Verify on a block explorer:';
    fragment.appendChild(p2);

    const ul = document.createElement('ul');
    BLOCK_EXPLORER_CONFIG[network].forEach(([name, url]) => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = `${url}${txid}`;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = name;
      li.appendChild(a);
      ul.appendChild(li);
    });
    fragment.appendChild(ul);

    messageArea.replaceChildren(renderMessage('success', fragment));

    if (mempoolTxData) {
      detailsArea.replaceChildren(renderTxDetails(mempoolTxData));
    }

    return;
  }

  if (pushErr && mempoolErr) {
    // pushing failed and we also couldn't fetch the TX details
    if (pushErr instanceof ProviderErrorsError) {
      const fragment = document.createDocumentFragment();

      const p = document.createElement('p');
      p.textContent = pushErr.message;
      fragment.appendChild(p);

      const ul = document.createElement('ul');
      pushErr.details.forEach((detail) => {
        const li = document.createElement('li');
        li.textContent = `${detail.url}: ${detail.body ?? ''}`;
        ul.appendChild(li);
      });
      fragment.appendChild(ul);

      messageArea.replaceChildren(renderMessage('error', fragment));
    } else {
      messageArea.replaceChildren(textMessage('error', pushErr.message));
    }
  } else if (mempoolErr) {
    messageArea.replaceChildren(textMessage('error', mempoolErr.message));
    return;
  }
}

run();

window.addEventListener('hashchange', run);
