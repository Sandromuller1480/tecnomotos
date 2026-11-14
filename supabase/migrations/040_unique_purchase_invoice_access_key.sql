-- Evita que o mesmo XML de NF-e seja recebido mais de uma vez e duplique o estoque.
CREATE UNIQUE INDEX IF NOT EXISTS idx_purchase_orders_invoice_access_key_unique
ON public.purchase_orders (invoice_access_key)
WHERE invoice_access_key IS NOT NULL;
