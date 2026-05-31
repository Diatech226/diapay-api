import { registerProvider } from './base';
import { bankCardProvider } from './bank-card';
import { bankTransferProvider } from './bank-transfer';
import { cryptoProvider } from './crypto';
import { mobileMoneyProvider } from './mobile-money';
import { mockProvider } from './mock/provider';

[mobileMoneyProvider, bankCardProvider, bankTransferProvider, cryptoProvider, mockProvider].forEach(registerProvider);

export * from './base';
