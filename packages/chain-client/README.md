# Chain client boundary
Backend owns this directory. Generate IDL/types from the implemented Anchor program, never hand-write an IDL.
Publish transaction builders and PDA helpers here only after Anchor account/instruction tests pass.
Frontend currently consumes TxIntent from the API and signs only after decoding and validating it.
Anchor 0.32.1 TypeScript integration must use its compatible legacy @solana/web3.js 1.x API,
not mix incompatible address/transaction classes from newer SDK generations.
No wallet adapter, IDL, program address, or transaction builder is included yet.
