-- ============================================================================
-- FARLANDS HACKATHON: Incremental Schema Update for Team ID & Admin Management
-- ============================================================================

-- Add team_id and status to teams if missing
alter table public.teams add column if not exists team_id text;
alter table public.teams add column if not exists status text not null default 'active';

-- Add check constraint on team status
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_status_check'
  ) then
    alter table public.teams add constraint teams_status_check check (status in ('active', 'disabled'));
  end if;
end $$;

-- Populate team_id for any existing teams without one
update public.teams
set team_id = 'FL26-' || upper(substr(md5(random()::text), 1, 6))
where team_id is null;

-- Make team_id unique
create unique index if not exists teams_team_id_uniq on public.teams (team_id);
create index if not exists teams_status_idx on public.teams (status);

-- Add optional college, course, year to participants if missing
alter table public.participants add column if not exists college text;
alter table public.participants add column if not exists course text;
alter table public.participants add column if not exists year text;
