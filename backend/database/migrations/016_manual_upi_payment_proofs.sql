-- Replaces the live payment gateway flow. Legacy gateway tables remain untouched so existing
-- financial records are not destructively removed; the application no longer reads or writes them.

drop function if exists public.confirm_captured_payment(uuid, text, jsonb);

alter table public.registrations drop constraint if exists registrations_fee_amount_check;
alter table public.registrations add constraint registrations_fee_amount_check check (fee_amount in (50000, 100000, 120000));

create type public.manual_payment_proof_status as enum ('pending_verification', 'paid', 'payment_failed');

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.registrations(id) on delete restrict,
  team_id uuid not null references public.teams(id) on delete restrict,
  submitted_by uuid not null references public.participants(id) on delete restrict,
  utr text not null,
  amount integer not null,
  currency text not null check (currency = 'INR'),
  screenshot_path text not null check (screenshot_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(png|jpg|webp)$'),
  status public.manual_payment_proof_status not null default 'pending_verification',
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_proofs_utr_format check (utr ~ '^[A-Z0-9-]{6,64}$'),
  constraint payment_proofs_review_fields check (
    (status = 'pending_verification' and reviewed_by is null and reviewed_at is null and rejection_reason is null)
    or (status = 'paid' and reviewed_by is not null and reviewed_at is not null and rejection_reason is null)
    or (status = 'payment_failed' and reviewed_by is not null and reviewed_at is not null and char_length(btrim(coalesce(rejection_reason, ''))) between 3 and 500)
  )
);

create unique index payment_proofs_utr_ci_uniq on public.payment_proofs (lower(utr));
create unique index payment_proofs_active_registration_uniq on public.payment_proofs (registration_id) where status in ('pending_verification', 'paid');
create index payment_proofs_review_queue_idx on public.payment_proofs (status, created_at desc);
create index payment_proofs_registration_idx on public.payment_proofs (registration_id, created_at desc);
create index payment_proofs_team_idx on public.payment_proofs (team_id, created_at desc);

alter table public.audit_logs add column if not exists payment_proof_id uuid references public.payment_proofs(id) on delete restrict;
create index if not exists audit_logs_payment_proof_id_idx on public.audit_logs (payment_proof_id);

create table public.payment_rate_limits (
  subject_hash text not null,
  action text not null,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (subject_hash, action)
);

alter table public.payment_proofs enable row level security;
alter table public.payment_rate_limits enable row level security;
revoke all on public.payment_proofs, public.payment_rate_limits from anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists payment_proofs_service_access on storage.objects;
create policy payment_proofs_service_access on storage.objects for all to service_role
  using (bucket_id = 'payment-proofs') with check (bucket_id = 'payment-proofs');

create or replace function public.validate_payment_proof()
returns trigger
language plpgsql
set search_path = public
as $$
declare v_registration public.registrations%rowtype;
begin
  select * into v_registration from public.registrations where id = new.registration_id;
  if not found then raise exception 'Registration not found'; end if;
  new.utr := upper(btrim(new.utr));
  if new.team_id <> v_registration.team_id then raise exception 'Payment proof team does not match registration'; end if;
  if new.amount <> v_registration.fee_amount or new.currency <> v_registration.currency then raise exception 'Payment proof amount does not match registration'; end if;
  return new;
end;
$$;

create trigger payment_proofs_validate before insert or update on public.payment_proofs
for each row execute function public.validate_payment_proof();

create or replace function public.submit_manual_payment_proof(
  p_registration_id uuid,
  p_participant_id uuid,
  p_utr text,
  p_screenshot_path text
)
returns table (proof_id uuid, proof_status text, submitted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare v_registration public.registrations%rowtype;
declare v_team_id uuid;
declare v_existing public.payment_proofs%rowtype;
declare v_proof public.payment_proofs%rowtype;
begin
  select * into v_registration from public.registrations where id = p_registration_id for update;
  if not found then raise exception 'Registration not found'; end if;
  if v_registration.status = 'confirmed' then raise exception 'Registration is already confirmed'; end if;
  select team_id into v_team_id from public.participants where id = p_participant_id and status = 'active';
  if v_team_id is null or v_team_id <> v_registration.team_id then raise exception 'Participant is not authorized for this registration'; end if;
  select * into v_existing from public.payment_proofs where registration_id = p_registration_id and status in ('pending_verification', 'paid') order by created_at desc limit 1;
  if found then
    if v_existing.utr = upper(btrim(p_utr)) then
      return query select v_existing.id, v_existing.status::text, v_existing.created_at;
      return;
    end if;
    raise exception 'A payment proof is already under verification for this registration';
  end if;
  insert into public.payment_proofs (registration_id, team_id, submitted_by, utr, amount, currency, screenshot_path)
  values (v_registration.id, v_registration.team_id, p_participant_id, upper(btrim(p_utr)), v_registration.fee_amount, v_registration.currency, p_screenshot_path)
  returning * into v_proof;
  update public.registrations set status = 'payment_processing', updated_at = now() where id = v_registration.id;
  insert into public.audit_logs (action, actor_role, actor_id, registration_id, payment_proof_id, metadata)
  values ('payment.proof_submitted', 'participant', p_participant_id, v_registration.id, v_proof.id, '{}'::jsonb);
  return query select v_proof.id, v_proof.status::text, v_proof.created_at;
end;
$$;

create or replace function public.review_manual_payment_proof(
  p_proof_id uuid,
  p_admin_user_id uuid,
  p_approve boolean,
  p_reason text default null
)
returns table (proof_id uuid, proof_status text, registration_id uuid, registration_status text)
language plpgsql
security definer
set search_path = public
as $$
declare v_proof public.payment_proofs%rowtype;
declare v_status public.registration_status;
begin
  if not p_approve and char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A rejection reason is required';
  end if;
  update public.payment_proofs
  set status = case when p_approve then 'paid'::public.manual_payment_proof_status else 'payment_failed'::public.manual_payment_proof_status end,
      reviewed_by = p_admin_user_id,
      reviewed_at = now(),
      rejection_reason = case when p_approve then null else btrim(p_reason) end,
      updated_at = now()
  where id = p_proof_id and status = 'pending_verification'
  returning * into v_proof;
  if not found then return; end if;
  v_status := case when p_approve then 'confirmed'::public.registration_status else 'pending_payment'::public.registration_status end;
  update public.registrations
  set status = v_status,
      confirmed_at = case when p_approve then now() else null end,
      updated_at = now()
  where id = v_proof.registration_id;
  insert into public.audit_logs (action, actor_role, actor_id, registration_id, payment_proof_id, metadata)
  values (case when p_approve then 'payment.proof_verified' else 'payment.proof_rejected' end, 'admin', p_admin_user_id, v_proof.registration_id, v_proof.id, '{}'::jsonb);
  return query select v_proof.id, v_proof.status::text, v_proof.registration_id, v_status::text;
end;
$$;

create or replace function public.take_payment_rate_limit(
  p_subject text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'Invalid rate limit'; end if;
  insert into public.payment_rate_limits (subject_hash, action, window_started_at, request_count)
  values (p_subject, p_action, now(), 1)
  on conflict (subject_hash, action) do update set
    request_count = case when public.payment_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then 1 else public.payment_rate_limits.request_count + 1 end,
    window_started_at = case when public.payment_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds) then now() else public.payment_rate_limits.window_started_at end
  returning request_count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.submit_manual_payment_proof(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_manual_payment_proof(uuid, uuid, boolean, text) from public, anon, authenticated;
revoke all on function public.take_payment_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_manual_payment_proof(uuid, uuid, text, text) to service_role;
grant execute on function public.review_manual_payment_proof(uuid, uuid, boolean, text) to service_role;
grant execute on function public.take_payment_rate_limit(text, text, integer, integer) to service_role;
