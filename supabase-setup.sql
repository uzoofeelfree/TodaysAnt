-- TodaysAnt v2.0: 사용자별 앱 데이터 저장소
-- Supabase Dashboard > SQL Editor > New query 에 붙여넣고 Run 하세요.

create table if not exists public.app_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"projects":[],"activeId":null,"profile":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_data enable row level security;

revoke all on table public.app_data from anon;
grant select, insert, update, delete on table public.app_data to authenticated;

create policy "Users can read their own TodaysAnt data"
on public.app_data for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert their own TodaysAnt data"
on public.app_data for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update their own TodaysAnt data"
on public.app_data for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete their own TodaysAnt data"
on public.app_data for delete to authenticated
using ((select auth.uid()) = user_id);

-- 다른 기기의 변경사항을 즉시 받기 위한 Realtime 등록
alter publication supabase_realtime add table public.app_data;


-- ============================================================
-- TodaysAnt 관리자 대시보드
-- 아래 ADMIN_EMAIL@example.com 을 실제 관리자 이메일로 바꾼 뒤 실행하세요.
-- ============================================================
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on table public.admin_users from anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists(select 1 from public.admin_users a where a.user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create or replace function public.admin_dashboard_stats()
returns table(total_users bigint, active_today bigint, active_7d bigint, active_30d bigint, total_projects bigint, total_hours numeric)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 없습니다'; end if;
  return query
  select
    (select count(*) from auth.users),
    count(*) filter (where d.updated_at >= date_trunc('day', now())),
    count(*) filter (where d.updated_at >= now() - interval '7 days'),
    count(*) filter (where d.updated_at >= now() - interval '30 days'),
    coalesce(sum(jsonb_array_length(coalesce(d.data->'projects','[]'::jsonb))),0)::bigint,
    round(coalesce(sum((select coalesce(sum(coalesce((p->>'elapsedMs')::numeric,0) + coalesce((p->>'sessionMs')::numeric,0)),0) from jsonb_array_elements(coalesce(d.data->'projects','[]'::jsonb)) p)),0) / 3600000, 1)
  from public.app_data d;
end;
$$;
revoke all on function public.admin_dashboard_stats() from public;
grant execute on function public.admin_dashboard_stats() to authenticated;

create or replace function public.admin_user_list()
returns table(user_id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz,email_confirmed_at timestamptz,last_activity_at timestamptz,project_count integer,total_hours numeric)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception '관리자 권한이 없습니다'; end if;
  return query
  select u.id,u.email::text,u.created_at,u.last_sign_in_at,u.email_confirmed_at,d.updated_at,
    jsonb_array_length(coalesce(d.data->'projects','[]'::jsonb)),
    round(coalesce((select sum(coalesce((p->>'elapsedMs')::numeric,0)+coalesce((p->>'sessionMs')::numeric,0)) from jsonb_array_elements(coalesce(d.data->'projects','[]'::jsonb)) p),0)/3600000,1)
  from auth.users u left join public.app_data d on d.user_id=u.id
  order by greatest(coalesce(d.updated_at,'epoch'::timestamptz),coalesce(u.last_sign_in_at,'epoch'::timestamptz),u.created_at) desc;
end;
$$;
revoke all on function public.admin_user_list() from public;
grant execute on function public.admin_user_list() to authenticated;

-- 반드시 이메일을 바꾸세요.
insert into public.admin_users(user_id)
select id from auth.users where email = 'woojueon@gmail.com'
on conflict (user_id) do nothing;
