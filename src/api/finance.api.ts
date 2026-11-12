import { createOwnedTableApi } from './owned-table.api';

export const accountsApi = createOwnedTableApi('accounts');
export const loansApi = createOwnedTableApi('loans');
export const transfersApi = createOwnedTableApi('transfers');
export const transactionsApi = createOwnedTableApi('transactions');
