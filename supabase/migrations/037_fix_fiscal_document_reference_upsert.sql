-- Allow fiscal provider results to be reconciled by their stable reference.
-- PostgreSQL permits multiple NULL values in a unique index. The previous
-- partial predicate prevented ON CONFLICT (reference) from being inferred.

DO $$
BEGIN
    IF EXISTS (
        SELECT reference
        FROM public.fiscal_documents
        WHERE reference IS NOT NULL
        GROUP BY reference
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Existem referencias fiscais duplicadas. Corrija-as antes de aplicar a migration 037.';
    END IF;
END
$$;

DROP INDEX IF EXISTS public.uniq_fiscal_documents_reference;

CREATE UNIQUE INDEX uniq_fiscal_documents_reference
    ON public.fiscal_documents (reference);
