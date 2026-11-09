
export interface BankDetails {
  bank_name?: string;
  account_holder?: string;
  account_name?: string;
  account_number?: string;
  ifsc_code?: string;
  ifsc?: string;
  branch?: string;
  bank_branch?: string;
  upi_id?: string;
}

export interface Company {
  id: string;
  name: string;
  gstin?: string;
  address?: string;
  phone?: string;
  license_key?: string;
  user_id?: string;
  created_by?: string;
  is_deleted?: boolean;
  bank_name?: string;
  account_holder?: string;
  account_name?: string;
  account_number?: string;
  ifsc_code?: string;
  ifsc?: string;
  branch?: string;
  bank_branch?: string;
  upi_id?: string;
  bank_details?: BankDetails;
}

export interface License {
  id: string;
  user_id: string;
  license_status: 'Active' | 'Expired' | 'Trial' | 'Suspended';
  trial_start?: string | null;
  trial_end?: string | null;
  created_at: string;
  updated_at: string;
  edition: string;
  license_key: string;
}

export interface LoginVerification {
  id: string;
  user_id: string;
  created_at: string;
  verified_at: string;
}

export interface Profile {
  id: string;
  active_company_id?: string | null;
  created_at: string;
  is_developer: boolean;
  user_id: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface Vendor {
  id: string;
  name: string;
  email: string;
  phone: string;
  gstin: string;
  pan?: string;
  account_number?: string;
  account_name?: string;
  ifsc_code?: string;
  address: string;
  balance: number;
  state?: string;
  default_duties?: any[];
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  gstin: string;
  pan?: string;
  account_number?: string;
  account_name?: string;
  ifsc_code?: string;
  address: string;
  balance: number;
  state?: string;
}

export interface StockItem {
  id: string;
  name: string;
  sku?: string;
  unit: string;
  hsn?: string;
  rate: number;
  selling_price: number;
  in_stock: number;
  description?: string;
  tax_rate: number;
  kg_per_bag?: number;
  company_id: string;
  is_deleted: boolean;
}

export interface BillItem {
  id: string;
  itemName: string;
  hsnCode: string;
  qty: number;
  unit: string;
  rate: number;
  tax_rate: number;
  taxableAmount: number;
  amount: number;
}

export interface Bill {
  id: string;
  vendor_name: string;
  bill_number: string;
  date: string;
  gst_type: 'Intra-State' | 'Inter-State';
  items: BillItem[];
  total_without_gst: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_gst: number;
  grand_total: number;
  round_off: number;
  duties_and_taxes: any[];
  status: 'Pending' | 'Paid';
  is_deleted: boolean;
  description?: string;
}

export interface SalesInvoice {
  id: string;
  customer_name: string;
  invoice_number: string;
  date: string;
  gst_type: 'Intra-State' | 'Inter-State';
  items: BillItem[];
  total_without_gst: number;
  total_cgst: number;
  total_sgst: number;
  total_igst: number;
  total_gst: number;
  grand_total: number;
  round_off: number;
  duties_and_taxes: any[];
  status: 'Pending' | 'Paid';
  is_deleted: boolean;
  description?: string;
}
