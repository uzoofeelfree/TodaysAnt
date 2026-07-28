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
