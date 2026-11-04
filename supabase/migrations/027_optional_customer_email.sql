-- Customer profiles may exist without a contact email. Supabase Auth still keeps
-- an internal identifier for those users, but it must not leak into business data.
ALTER TABLE public.profiles
    ALTER COLUMN email DROP NOT NULL;
