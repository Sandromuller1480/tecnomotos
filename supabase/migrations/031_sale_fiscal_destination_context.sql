BEGIN;

-- Fiscal destination is captured per sale. This supports counter pickup and
-- deliveries throughout Brazil without changing the customer's usual data.
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS fiscal_taxpayer_indicator TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_state_registration TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_recipient_document TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_freight_mode TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_destination_street TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_destination_number TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_destination_complement TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_destination_neighborhood TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_destination_city TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_destination_uf TEXT,
    ADD COLUMN IF NOT EXISTS fiscal_destination_postal_code TEXT;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_delivery_mode;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_delivery_mode
    CHECK (delivery_mode IS NULL OR delivery_mode IN ('pickup', 'delivery'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_purchase_purpose;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_purchase_purpose
    CHECK (purchase_purpose IS NULL OR purchase_purpose IN ('resale', 'final_consumption'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_fiscal_taxpayer_indicator;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_fiscal_taxpayer_indicator
    CHECK (fiscal_taxpayer_indicator IS NULL OR fiscal_taxpayer_indicator IN ('contributor', 'exempt', 'non_contributor'));

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_fiscal_destination_uf;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_fiscal_destination_uf
    CHECK (fiscal_destination_uf IS NULL OR fiscal_destination_uf ~ '^[A-Z]{2}$');

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS chk_orders_fiscal_freight_mode;
ALTER TABLE public.orders ADD CONSTRAINT chk_orders_fiscal_freight_mode
    CHECK (fiscal_freight_mode IS NULL OR fiscal_freight_mode IN ('issuer', 'recipient', 'third_party', 'none'));

COMMIT;
