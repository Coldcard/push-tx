export type Network = 'BTC' | 'XTN' | 'XRT';

interface MempoolConfirmedStatus {
  confirmed: true;
  block_height: number;
}

interface MempoolUnconfirmedStatus {
  confirmed: false;
}

export interface MempoolTxData {
  vin: {
    prevout: {
      scriptpubkey_address: string;
      value: number;
    };
  }[];
  vout: {
    scriptpubkey_address: string;
    value: number;
  }[];
  fee: number;
  status: MempoolConfirmedStatus | MempoolUnconfirmedStatus;
}
