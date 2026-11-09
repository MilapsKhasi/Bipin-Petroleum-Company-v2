-- ==============================================================================
-- SUPABASE SCHEMA SCRIPT FOR BP_ TABLES
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS public.bp_customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.bp_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    pan TEXT,
    address TEXT,
    state TEXT,
    city TEXT,
    pincode TEXT,
    opening_balance NUMERIC DEFAULT 0,
    credit_limit NUMERIC DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Vendors Table
CREATE TABLE IF NOT EXISTS public.bp_vendors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.bp_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    gstin TEXT,
    pan TEXT,
    address TEXT,
    state TEXT,
    city TEXT,
    pincode TEXT,
    party_type TEXT DEFAULT 'vendor',
    is_customer BOOLEAN DEFAULT FALSE,
    opening_balance NUMERIC DEFAULT 0,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Stock Items Table
CREATE TABLE IF NOT EXISTS public.bp_stock_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.bp_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    item_code TEXT,
    hsn_code TEXT,
    unit TEXT DEFAULT 'PCS',
    purchase_price NUMERIC DEFAULT 0,
    sales_price NUMERIC DEFAULT 0,
    tax_rate NUMERIC DEFAULT 0,
    opening_stock NUMERIC DEFAULT 0,
    in_stock NUMERIC DEFAULT 0,
    min_stock_alert NUMERIC DEFAULT 0,
    category TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sales Invoices Table
CREATE TABLE IF NOT EXISTS public.bp_sales_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.bp_companies(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    date DATE NOT NULL,
    due_date DATE,
    customer_id UUID REFERENCES public.bp_customers(id) ON DELETE SET NULL,
    customer_name TEXT,
    billing_address TEXT,
    shipping_address TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    additional_charges JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC DEFAULT 0,
    total_tax NUMERIC DEFAULT 0,
    round_off NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    amount_paid NUMERIC DEFAULT 0,
    balance_amount NUMERIC DEFAULT 0,
    payment_status TEXT DEFAULT 'Unpaid',
    notes TEXT,
    terms TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Purchase Bills Table
CREATE TABLE IF NOT EXISTS public.bp_purchase_bills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.bp_companies(id) ON DELETE CASCADE,
    bill_number TEXT NOT NULL,
    date DATE NOT NULL,
    due_date DATE,
    vendor_id UUID REFERENCES public.bp_vendors(id) ON DELETE SET NULL,
    vendor_name TEXT,
    items JSONB DEFAULT '[]'::jsonb,
    additional_charges JSONB DEFAULT '[]'::jsonb,
    subtotal NUMERIC DEFAULT 0,
    total_tax NUMERIC DEFAULT 0,
    round_off NUMERIC DEFAULT 0,
    total_amount NUMERIC NOT NULL DEFAULT 0,
    amount_paid NUMERIC DEFAULT 0,
    balance_amount NUMERIC DEFAULT 0,
    payment_status TEXT DEFAULT 'Unpaid',
    notes TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Cashbooks Table
CREATE TABLE IF NOT EXISTS public.bp_cashbooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.bp_companies(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    opening_cash NUMERIC DEFAULT 0,
    cash_in NUMERIC DEFAULT 0,
    cash_out NUMERIC DEFAULT 0,
    closing_cash NUMERIC DEFAULT 0,
    denominations JSONB DEFAULT '{}'::jsonb,
    remarks TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Additional Charges Table
CREATE TABLE IF NOT EXISTS public.bp_additional_charges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES public.bp_companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    charge_type TEXT DEFAULT 'Fixed',
    value NUMERIC DEFAULT 0,
    tax_rate NUMERIC DEFAULT 0,
    hsn_code TEXT,
    is_deleted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_bp_customers_cid ON public.bp_customers(company_id);
CREATE INDEX IF NOT EXISTS idx_bp_vendors_cid ON public.bp_vendors(company_id);
CREATE INDEX IF NOT EXISTS idx_bp_stock_items_cid ON public.bp_stock_items(company_id);
CREATE INDEX IF NOT EXISTS idx_bp_sales_invoices_cid ON public.bp_sales_invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_bp_purchase_bills_cid ON public.bp_purchase_bills(company_id);
CREATE INDEX IF NOT EXISTS idx_bp_cashbooks_cid ON public.bp_cashbooks(company_id);
CREATE INDEX IF NOT EXISTS idx_bp_add_charges_cid ON public.bp_additional_charges(company_id);
