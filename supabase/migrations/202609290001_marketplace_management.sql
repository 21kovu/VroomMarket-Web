begin;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false);
$$;

grant execute on function public.is_admin() to authenticated;

create table if not exists public.dealers (
  id uuid primary key references auth.users(id) on delete cascade,
  yard_name text not null,
  email text not null,
  phone text not null,
  whatsapp_number text not null,
  location text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.cars (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  dealer_name text not null,
  make text not null,
  model text not null,
  year integer not null,
  price numeric(14, 2) not null check (price > 0),
  condition text not null,
  color text not null default '',
  mileage text not null default '',
  fuel text not null default '',
  transmission text not null default '',
  location text not null default '',
  image_url text not null default '',
  description text not null default '',
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.cars drop constraint if exists cars_status_check;
alter table public.cars add constraint cars_status_check
  check (status in ('pending', 'approved', 'rejected', 'sold')) not valid;

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  car_id uuid references public.cars(id) on delete set null,
  car_title text not null,
  buyer_name text not null,
  buyer_phone text not null,
  viewing_date date not null,
  viewing_time time not null,
  message text not null default '',
  status text not null default 'Pending',
  created_at timestamptz not null default now()
);

create table if not exists public.car_photos (
  id uuid primary key default gen_random_uuid(),
  car_id uuid not null references public.cars(id) on delete cascade,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists car_photos_car_id_idx on public.car_photos(car_id);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid not null references public.dealers(id) on delete cascade,
  car_id uuid references public.cars(id) on delete set null,
  amount numeric(14, 2) not null check (amount > 0),
  sale_date date not null default current_date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sales_dealer_date_idx on public.sales(dealer_id, sale_date desc);

alter table public.car_photos enable row level security;
alter table public.sales enable row level security;
alter table public.dealers enable row level security;
alter table public.cars enable row level security;
alter table public.appointments enable row level security;

do $$
declare
  existing_policy record;
begin
  for existing_policy in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('dealers', 'cars', 'appointments', 'car_photos', 'sales')
  loop
    execute format('drop policy %I on %I.%I', existing_policy.policyname, existing_policy.schemaname, existing_policy.tablename);
  end loop;
end;
$$;

create policy "Dealers read own profile and admins read all" on public.dealers
  for select to authenticated using (id = auth.uid() or public.is_admin());

create policy "Admins update dealer profiles" on public.dealers
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete dealer profiles" on public.dealers
  for delete to authenticated using (public.is_admin());

create policy "Approved cars are public" on public.cars
  for select to anon, authenticated using (status = 'approved' or dealer_id = auth.uid() or public.is_admin());

drop policy if exists "Dealers add pending cars" on public.cars;
create policy "Dealers add pending cars" on public.cars
  for insert to authenticated with check (dealer_id = auth.uid() and status = 'pending');

drop policy if exists "Dealers update own cars" on public.cars;
create policy "Dealers update own cars" on public.cars
  for update to authenticated
  using (dealer_id = auth.uid() or public.is_admin())
  with check ((dealer_id = auth.uid() and status in ('pending', 'sold')) or public.is_admin());

drop policy if exists "Admins delete cars" on public.cars;
create policy "Admins delete cars" on public.cars
  for delete to authenticated using (public.is_admin());

drop policy if exists "Dealers and admins read appointments" on public.appointments;
create policy "Dealers and admins read appointments" on public.appointments
  for select to authenticated using (dealer_id = auth.uid() or public.is_admin());

drop policy if exists "Public buyers request appointments" on public.appointments;
create policy "Public buyers request appointments" on public.appointments
  for insert to anon, authenticated with check (
    exists (
      select 1 from public.cars
      where cars.id = appointments.car_id
        and cars.dealer_id = appointments.dealer_id
        and cars.status = 'approved'
    )
  );

drop policy if exists "Admins update appointments" on public.appointments;
create policy "Admins update appointments" on public.appointments
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Approved car photos are public" on public.car_photos;
create policy "Approved car photos are public" on public.car_photos
  for select to anon, authenticated using (
    public.is_admin() or exists (
      select 1 from public.cars
      where cars.id = car_photos.car_id and cars.status = 'approved'
    )
  );

drop policy if exists "Dealers add photos to own cars" on public.car_photos;
create policy "Dealers add photos to own cars" on public.car_photos
  for insert to authenticated with check (
    exists (select 1 from public.cars where cars.id = car_photos.car_id and cars.dealer_id = auth.uid())
  );

drop policy if exists "Dealers and admins remove car photos" on public.car_photos;
create policy "Dealers and admins remove car photos" on public.car_photos
  for delete to authenticated using (
    public.is_admin() or exists (
      select 1 from public.cars where cars.id = car_photos.car_id and cars.dealer_id = auth.uid()
    )
  );

drop policy if exists "Dealers and admins read sales" on public.sales;
create policy "Dealers and admins read sales" on public.sales
  for select to authenticated using (dealer_id = auth.uid() or public.is_admin());

drop policy if exists "Dealers record own sales" on public.sales;
create policy "Dealers record own sales" on public.sales
  for insert to authenticated with check (
    dealer_id = auth.uid() and exists (
      select 1 from public.cars where cars.id = sales.car_id and cars.dealer_id = auth.uid()
    )
  );

insert into storage.buckets (id, name, public)
values ('car-images', 'car-images', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can view car images" on storage.objects;
create policy "Public can view car images" on storage.objects
  for select to anon, authenticated using (bucket_id = 'car-images');

drop policy if exists "Dealers upload own car images" on storage.objects;
create policy "Dealers upload own car images" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'car-images' and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Dealers and admins remove car images" on storage.objects;
create policy "Dealers and admins remove car images" on storage.objects
  for delete to authenticated using (
    bucket_id = 'car-images' and (
      public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

create or replace function public.get_public_dealer_contacts()
returns table (id uuid, yard_name text, phone text, whatsapp_number text, location text)
language sql
stable
security definer
set search_path = public
as $$
  select d.id, d.yard_name, d.phone, d.whatsapp_number, d.location
  from public.dealers as d;
$$;

grant execute on function public.get_public_dealer_contacts() to anon, authenticated;

grant select on public.cars to anon, authenticated;
grant insert, update, delete on public.cars to authenticated;
grant select, update, delete on public.dealers to authenticated;
grant select, insert, update on public.appointments to authenticated;
grant insert on public.appointments to anon;
grant select, insert, delete on public.car_photos to authenticated;
grant select on public.car_photos to anon;
grant select, insert on public.sales to authenticated;

commit;
