export const TX_API_URLS = {
  // POST to these when pushing a TX (body is transaction HEX)
  // GET  .../{txid} to get TX details
  BTC: ['https://mempool.space/api/tx', 'https://blockstream.info/api/tx'],
  XTN: ['https://mempool.space/testnet/api/tx', 'https://blockstream.info/testnet/api/tx'],
} as const;

export const BLOCK_EXPLORER_CONFIG = {
  // Name and URL prefix of block explorers that we link to after TX is pushed
  // TXID will be appended to the URL
  BTC: [
    ['mempool.space', 'https://mempool.space/tx/'],
    ['blockstream.info', 'https://blockstream.info/tx/'],
    ['btcscan.org', 'https://btcscan.org/tx/'],
    ['btc.com', 'https://explorer.btc.com/btc/transaction/'],
  ],
  XTN: [
    ['mempool.space', 'https://mempool.space/testnet/tx/'],
    ['blockstream.info', 'https://blockstream.info/testnet/tx/'],
    ['blockcypher.com', 'https://live.blockcypher.com/btc-testnet/tx/'],
  ],
} as const;

export const MESSAGE_ICONS = {
  // SVGs for icons/spinner on the message box
  // - taken from https://icons.getbootstrap.com
  // - but inlining because easier to bundle into a single file this way

  success: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 16 16">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
      <path d="m10.97 4.97-.02.022-3.473 4.425-2.093-2.094a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-1.071-1.05"/>
    </svg>`,

  error: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 16 16">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
      <path d="M7.002 11a1 1 0 1 1 2 0 1 1 0 0 1-2 0M7.1 4.995a.905.905 0 1 1 1.8 0l-.35 3.507a.552.552 0 0 1-1.1 0z"/>
    </svg>`,

  info: `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" class="bi bi-info-circle" viewBox="0 0 16 16">
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14m0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16"/>
      <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0"/>
    </svg>`,

  // note: spinning animation is defined in CSS file
  progress: `
    <svg class="pushtx-spin" width="32" height="32" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle style="opacity: 0.25;" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>`,
} as const;
