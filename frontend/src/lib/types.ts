/** Mirrors backend/app/schemas.py. */

export type TxnStatus = "SUCCESS" | "FAILED" | "PENDING";
export type SortField = "occurred_at" | "amount";
export type SortOrder = "asc" | "desc";

export interface Transaction {
  id: number;
  external_id: string;
  occurred_at: string;
  merchant: string;
  category: string | null;
  amount: string;
  currency: string;
  status: TxnStatus;
  payment_method: string;
  coins_earned: number;
  is_refund: boolean;
  is_amount_outlier: boolean;
  has_duplicate_external_id: boolean;
}

export interface PageMeta {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface TransactionPage {
  items: Transaction[];
  meta: PageMeta;
  filtered_total_amount: string;
  filtered_coins: number;
}

export interface CategorySlice {
  category: string | null;
  total_amount: string;
  transaction_count: number;
  share: number;
}

export interface MonthPoint {
  month: string;
  total_amount: string;
  transaction_count: number;
}

export interface Analytics {
  by_category: CategorySlice[];
  monthly: MonthPoint[];
  total_amount: string;
  transaction_count: number;
  excluded_outliers: number;
}

export interface FilterOptions {
  categories: string[];
  statuses: TxnStatus[];
  payment_methods: string[];
  min_amount: string;
  max_amount: string;
  earliest: string | null;
  latest: string | null;
}

export interface CoinBalance {
  balance: number;
  coins_earned: number;
  coins_redeemed: number;
}

export interface Reward {
  id: number;
  sku: string;
  title: string;
  description: string;
  kind: "voucher" | "cashback" | "bill_credit";
  coin_cost: number;
  value_inr: string;
  affordable: boolean;
}

export interface Redemption {
  id: number;
  reward_id: number;
  reward_title: string;
  coin_cost: number;
  created_at: string;
  balance_after: number;
  replayed: boolean;
}

/** The filter state the UI owns. Serialised to query params by lib/api.ts. */
export interface Filters {
  search: string;
  categories: string[];
  statuses: TxnStatus[];
  paymentMethods: string[];
  dateFrom: string | null;
  dateTo: string | null;
  minAmount: string | null;
  maxAmount: string | null;
  uncategorisedOnly: boolean;
  includeOutliers: boolean;
  includeRefunds: boolean;
}

export const EMPTY_FILTERS: Filters = {
  search: "",
  categories: [],
  statuses: [],
  paymentMethods: [],
  dateFrom: null,
  dateTo: null,
  minAmount: null,
  maxAmount: null,
  uncategorisedOnly: false,
  includeOutliers: false,
  includeRefunds: true,
};

export function countActiveFilters(f: Filters): number {
  let n = 0;
  if (f.search.trim()) n++;
  if (f.categories.length) n++;
  if (f.statuses.length) n++;
  if (f.paymentMethods.length) n++;
  if (f.dateFrom || f.dateTo) n++;
  if (f.minAmount || f.maxAmount) n++;
  if (f.uncategorisedOnly) n++;
  if (f.includeOutliers) n++;
  if (!f.includeRefunds) n++;
  return n;
}
