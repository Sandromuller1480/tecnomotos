import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getEmployeeDashboardPath } from '@/lib/auth/employee-dashboard';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Paths classification
  const isAdminPath = pathname.startsWith('/admin');
  const isClientPath = pathname.startsWith('/cliente');
  const isLoginPath = pathname === '/login';

  // If user is NOT authenticated
  if (!user) {
    if (isAdminPath || isClientPath) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    return response;
  }

  // Get user role from JWT app_metadata (synced via database trigger)
  // Fallback to user_metadata or default to CUSTOMER if not set yet
  const role = (user.app_metadata?.role as string) || (user.user_metadata?.role as string) || 'CUSTOMER';

  // If user IS authenticated and tries to access /login
  if (isLoginPath) {
    if (role === 'OWNER') {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    } else if (role === 'EMPLOYEE') {
      const employeeFunction =
        (user.app_metadata?.employee_function as string | undefined) ||
        (user.user_metadata?.employee_function as string | undefined);
      return NextResponse.redirect(new URL(getEmployeeDashboardPath(employeeFunction), request.url));
    } else {
      return NextResponse.redirect(new URL('/cliente', request.url));
    }
  }

  // If user is a CUSTOMER trying to access /admin
  if (isAdminPath && role === 'CUSTOMER') {
    return NextResponse.redirect(new URL('/cliente', request.url));
  }

  // If user is an OWNER or EMPLOYEE trying to access /cliente
  if (isClientPath && (role === 'OWNER' || role === 'EMPLOYEE')) {
    const employeeFunction =
      (user.app_metadata?.employee_function as string | undefined) ||
      (user.user_metadata?.employee_function as string | undefined);
    return NextResponse.redirect(new URL(role === 'EMPLOYEE' ? getEmployeeDashboardPath(employeeFunction) : '/admin/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - inagens (branding images)
     * - public (public assets)
     * - api/auth/bootstrap (bootstrap trigger)
     */
    '/((?!_next/static|_next/image|favicon.ico|inagens|public|api/auth/bootstrap).*)',
  ],
};
