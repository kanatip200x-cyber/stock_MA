-- =====================================================================
-- ฐานข้อมูลเว็บคลังสินค้า (Supabase / PostgreSQL)
-- รันไฟล์นี้ใน Supabase Dashboard > SQL Editor ได้ (รันซ้ำได้ ไม่ลบข้อมูลเดิม)
-- ตาราง: profiles (ผู้ใช้), locations (คลัง/พื้นที่), products (สินค้า),
--        stock_movements (ประวัติรับเข้า/ขนย้าย)
-- ทุกตารางเปิด Row Level Security: ต้องล็อกอินก่อนจึงอ่าน/เขียนได้
-- =====================================================================

-- ---------- ผู้ใช้ ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'staff' check (role in ('staff','admin')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);

-- สร้างโปรไฟล์อัตโนมัติเมื่อมีผู้ใช้ล็อกอินด้วย Google ครั้งแรก
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ---------- คลัง/พื้นที่ ----------
create table if not exists public.locations (
  code text primary key,
  label text not null,
  is_destination boolean not null default true,
  sort_order int not null default 0
);

-- ---------- สินค้า ----------
create table if not exists public.products (
  id bigint generated always as identity primary key,
  name text not null,
  sku text not null,
  qty int not null default 0 check (qty >= 0),
  lot text not null default '—',
  pallet text not null default '—',
  location text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
);
create index if not exists products_created_at_idx on public.products (created_at desc);

-- ---------- ประวัติการเคลื่อนไหว ----------
create table if not exists public.stock_movements (
  id bigint generated always as identity primary key,
  product_id bigint references public.products(id) on delete set null,
  type text not null check (type in ('IN','MOVE')),
  name text not null,
  sku text not null,
  qty int not null,
  lot text,
  pallet text,
  from_location text,
  to_location text,
  note text,
  user_id uuid not null default auth.uid() references auth.users(id) on delete set null,
  user_name text,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_created_at_idx on public.stock_movements (created_at desc);

-- ---------- ฟังก์ชันทำรายการ (ทำทั้งก้อนในครั้งเดียว) ----------
create or replace function public.current_user_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(full_name, email) from public.profiles where id = auth.uid();
$$;

-- รับสินค้าเข้า: เพิ่มสินค้า + บันทึกประวัติ
create or replace function public.receive_product(
  p_name text, p_sku text, p_qty int, p_lot text, p_pallet text, p_location text, p_note text default null)
returns public.products language plpgsql security invoker set search_path = '' as $$
declare v public.products;
begin
  if auth.uid() is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'จำนวนต้องมากกว่า 0'; end if;
  insert into public.products (name, sku, qty, lot, pallet, location)
  values (p_name, p_sku, p_qty, coalesce(p_lot,'—'), coalesce(p_pallet,'—'), p_location)
  returning * into v;
  insert into public.stock_movements (product_id, type, name, sku, qty, lot, pallet, from_location, to_location, note, user_name)
  values (v.id, 'IN', v.name, v.sku, v.qty, v.lot, v.pallet, null, v.location, p_note, public.current_user_name());
  return v;
end $$;

-- ขนย้ายสินค้า: เปลี่ยนตำแหน่ง + บันทึกประวัติ
create or replace function public.move_product(p_product_id bigint, p_to text, p_note text default null)
returns public.products language plpgsql security invoker set search_path = '' as $$
declare v public.products; v_from text;
begin
  if auth.uid() is null then raise exception 'ต้องล็อกอินก่อน'; end if;
  select location into v_from from public.products where id = p_product_id for update;
  if not found then raise exception 'ไม่พบสินค้า'; end if;
  if v_from = p_to then raise exception 'ปลายทางเป็นตำแหน่งเดิม'; end if;
  update public.products set location = p_to, updated_at = now(), updated_by = auth.uid()
   where id = p_product_id returning * into v;
  insert into public.stock_movements (product_id, type, name, sku, qty, lot, pallet, from_location, to_location, note, user_name)
  values (v.id, 'MOVE', v.name, v.sku, v.qty, v.lot, v.pallet, v_from, p_to, p_note, public.current_user_name());
  return v;
end $$;

revoke execute on function public.receive_product(text,text,int,text,text,text,text) from anon, public;
revoke execute on function public.move_product(bigint,text,text) from anon, public;
grant execute on function public.receive_product(text,text,int,text,text,text,text) to authenticated;
grant execute on function public.move_product(bigint,text,text) to authenticated;
-- ฟังก์ชันภายใน: ไม่ให้คนที่ยังไม่ล็อกอินเรียกใช้
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.current_user_name() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_user_name() to authenticated;

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.locations enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "profiles: read when logged in" on public.profiles;
create policy "profiles: read when logged in" on public.profiles for select to authenticated using (true);
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- ผู้ใช้แก้ role ของตัวเองไม่ได้ (แก้ได้เฉพาะ last_seen_at / ชื่อ / รูป)
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, last_seen_at) on public.profiles to authenticated;

drop policy if exists "locations: read" on public.locations;
create policy "locations: read" on public.locations for select to authenticated using (true);
drop policy if exists "locations: admin write" on public.locations;
create policy "locations: admin write" on public.locations for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "products: read" on public.products;
create policy "products: read" on public.products for select to authenticated using (true);
drop policy if exists "products: insert" on public.products;
create policy "products: insert" on public.products for insert to authenticated with check (true);
drop policy if exists "products: update" on public.products;
create policy "products: update" on public.products for update to authenticated using (true) with check (true);
drop policy if exists "products: admin delete" on public.products;
create policy "products: admin delete" on public.products for delete to authenticated using ((select public.is_admin()));

drop policy if exists "movements: read" on public.stock_movements;
create policy "movements: read" on public.stock_movements for select to authenticated using (true);
drop policy if exists "movements: insert own" on public.stock_movements;
create policy "movements: insert own" on public.stock_movements for insert to authenticated
  with check (user_id = (select auth.uid()));
-- ไม่มี policy update/delete: ประวัติแก้ไขหรือลบไม่ได้

-- ---------- Realtime (หน้าเว็บอัปเดตทันทีเมื่อมีคนรับเข้า/ขนย้าย) ----------
do $$ begin
  alter publication supabase_realtime add table public.products;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.stock_movements;
exception when duplicate_object then null; end $$;

-- ---------- ข้อมูลตั้งต้น ----------
insert into public.locations (code, label, sort_order) values
  ('6-2-11','คลัง/พื้นที่ 6-2-11',1), ('6-1-2','คลัง/พื้นที่ 6-1-2',2),
  ('2-2-7','คลัง/พื้นที่ 2-2-7',3), ('พื้นที่พักสินค้า A','พื้นที่พักสินค้า A',4)
on conflict (code) do nothing;

insert into public.products (name, sku, qty, lot, pallet, location)
select * from (values
  ('ผักกาดดอง','DEMO-1001',60,'LOT-2611-01','P01','6-2-11'),
  ('ผักกาดดอง','DEMO-1001',60,'LOT-2611-02','P02','6-1-2'),
  ('ขิงดอง','DEMO-1002',60,'LOT-2611-03','P03','2-2-7'),
  ('ขิงดอง','DEMO-1002',60,'LOT-2611-04','P04','2-2-6'),
  ('มะนาวดอง','DEMO-1003',60,'LOT-2611-05','P05','6-2-9'),
  ('มะนาวดอง','DEMO-1003',60,'LOT-2611-06','P06','6-1-13'),
  ('กระเทียมดอง','DEMO-1004',60,'LOT-2611-07','P07','6-1-12'),
  ('กระเทียมดอง','DEMO-1004',60,'LOT-2611-08','P08','2-1-8')
) as seed(name, sku, qty, lot, pallet, location)
where not exists (select 1 from public.products);

-- ตั้งตัวเองเป็นแอดมิน (แก้อีเมลแล้วรันหลังล็อกอินครั้งแรก):
-- update public.profiles set role = 'admin' where email = 'your.name@gmail.com';
