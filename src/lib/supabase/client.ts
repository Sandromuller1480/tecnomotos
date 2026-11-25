import { createBrowserClient } from '@supabase/ssr';

function buildClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let browserClient: ReturnType<typeof buildClient> | undefined;

export function createClient() {
  browserClient ??= buildClient();

  return browserClient;
}
