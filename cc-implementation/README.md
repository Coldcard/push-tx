# COLDCARD Website Implementation

This is the code for the NFC Push TX implementation at <https://coldcard.com/pushtx>.

## Overview

We use the APIs of mempool.space and blockstream.info to broadcast the transaction
and for retrieving additional transaction details afterwards.

In an edge case where the transaction is already confirmed (e.g. same Push TX URL
used twice), the APIs respond with a 400 error. If that happens, we use
[bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) to compute the TXID
and try to fetch the details anyway.

## How to Build

To build, you need Node.js and NPM installed. There's a `Makefile` target for
installing dependencies and running the build:

```
make build
```

This builds two versions:

- Separate JS and CSS files that power <https://coldcard.com/pushtx> - saved to `build/`
- A self-contained HTML where all JS and CSS is inlined, which is useful for easy
  self-hosting - saved to `build-single-file/`.

## Don't Trust, Verify

The `SHA256SUMS` file includes hashes of all important files in this repo and is
signed with the PGP key `3F4D 2119 6E14 FD39 3835  492D F960 23C5 8E14 72C9` in
`SHA256SUMS.asc` (detached signature).

To check the signature:

```
gpg --verify SHA256SUMS.asc
```

To check the hashes match:

```
shasum -a 256 -c SHA256SUMS
```
