CREATE TABLE IF NOT EXISTS public.service_order_products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_order_id UUID REFERENCES public.service_orders(id) ON DELETE CASCADE NOT NULL,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    product_sku TEXT,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_order_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_service_order_products ON public.service_order_products FOR SELECT USING (
    public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'service_orders.view')
);

CREATE POLICY insert_service_order_products ON public.service_order_products FOR INSERT WITH CHECK (
    public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'service_orders.create') OR
    public.has_permission(auth.uid(), 'service_orders.update')
);

CREATE POLICY update_service_order_products ON public.service_order_products FOR UPDATE USING (
    public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'service_orders.update')
);

CREATE POLICY delete_service_order_products ON public.service_order_products FOR DELETE USING (
    public.is_owner(auth.uid()) OR
    public.has_permission(auth.uid(), 'service_orders.update')
);
