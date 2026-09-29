# VroomMarket

Static car marketplace with Supabase Auth, Postgres, Storage, and Edge Functions.

## Supabase setup

1. Create a Supabase project and copy its Project URL and publishable (anon) key into `supabase.js`. These browser values are public; never put a service-role key in this repository.
2. In the Supabase SQL Editor, run [`supabase/migrations/202609290001_marketplace_management.sql`](supabase/migrations/202609290001_marketplace_management.sql). It creates photo and sales tables, the public dealer-contact RPC, and row-level security policies.
3. Create the first user in Supabase Authentication. In the SQL Editor, grant that account its initial admin role, replacing the email:

	```sql
	update auth.users
	set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb
	where email = lower('you@example.com');
	```

	Sign out and back in so the new role appears in the access token. New admins created in the Admin dashboard receive this role automatically.
4. Install and authenticate the Supabase CLI, link this repository to the project, and deploy the protected admin function:

	```text
	supabase login
	supabase link --project-ref YOUR_PROJECT_REF
	supabase functions deploy admin-users
	```

	Supabase provides the function's `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment variables. The service-role key must remain server-side.

## Hosting

The GitHub Actions workflow in `.github/workflows/pages.yml` publishes the five static site files to GitHub Pages whenever `main` is updated. In the repository's **Settings → Pages**, select **GitHub Actions** as the build and deployment source. After the first successful workflow, the site is available at the Pages URL shown by GitHub.

The site is not production-ready until the Supabase URL/key are configured, the migration is applied, an initial admin is bootstrapped, and the Edge Function is deployed. A custom domain was removed from this repository previously; configure it in GitHub Pages only after confirming the intended domain and DNS records.

## Features

- Buyers can search approved cars, browse multiple photos, contact dealers, and request viewings.
- Dealers can publish listings with multiple photos, review viewing requests, record sales, and change their own password.
- Admins can add dealers and admins, reset dealer passwords, review and approve listings, remove listings or individual photos, and review appointments and sales.

