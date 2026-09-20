-- ============================================================================
-- FARLANDS HACKATHON: Atomic Team Registration RPC
-- ============================================================================

create or replace function public.register_team_atomic(
  p_team_name text,
  p_team_id text,
  p_registration_number text,
  p_fee_amount integer,
  p_currency text,
  p_members jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_reg_id uuid;
  v_member jsonb;
  v_email text;
  v_part_id uuid;
  v_part_code text;
  v_created_parts jsonb := '[]'::jsonb;
  v_result jsonb;
begin
  -- 1. Check team name uniqueness (case-insensitive)
  if exists (
    select 1 from public.teams where lower(team_name) = lower(btrim(p_team_name))
  ) then
    raise exception 'A team with this name has already registered' using errcode = '23505';
  end if;

  -- 2. Check team_id uniqueness
  if exists (
    select 1 from public.teams where team_id = p_team_id
  ) then
    raise exception 'Team ID collision occurred' using errcode = '23505';
  end if;

  -- 3. Check participant emails uniqueness
  for v_member in select * from jsonb_array_elements(p_members) loop
    v_email := lower(btrim(v_member->>'email'));
    if exists (
      select 1 from public.participants where lower(email) = v_email
    ) then
      raise exception 'Email % is already registered', v_email using errcode = '23505';
    end if;
  end loop;

  -- 4. Insert Team
  insert into public.teams (team_name, team_id, status)
  values (btrim(p_team_name), p_team_id, 'active')
  returning id into v_team_id;

  -- 5. Insert Participants and Profiles
  for v_member in select * from jsonb_array_elements(p_members) loop
    v_part_code := 'P-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 12));
    
    insert into public.participants (
      participant_id,
      name,
      email,
      phone,
      college,
      course,
      year,
      team_id,
      auth_user_id,
      status
    ) values (
      v_part_code,
      btrim(v_member->>'name'),
      lower(btrim(v_member->>'email')),
      nullif(btrim(v_member->>'phone'), ''),
      nullif(btrim(v_member->>'college'), ''),
      nullif(btrim(v_member->>'course'), ''),
      nullif(btrim(v_member->>'year'), ''),
      v_team_id,
      (v_member->>'auth_user_id')::uuid,
      'active'
    )
    returning id into v_part_id;

    -- Create Auth Profile if auth_user_id provided
    if (v_member->>'auth_user_id') is not null then
      insert into public.auth_profiles (user_id, role, participant_id)
      values ((v_member->>'auth_user_id')::uuid, 'participant', v_part_id);
    end if;

    v_created_parts := v_created_parts || jsonb_build_object(
      'id', v_part_id,
      'participant_id', v_part_code,
      'name', btrim(v_member->>'name'),
      'email', lower(btrim(v_member->>'email')),
      'auth_user_id', v_member->>'auth_user_id'
    );
  end loop;

  -- 6. Insert Registration Record
  insert into public.registrations (
    team_id,
    registration_number,
    fee_amount,
    currency,
    status
  ) values (
    v_team_id,
    p_registration_number,
    p_fee_amount,
    p_currency,
    'pending_payment'
  )
  returning id into v_reg_id;

  -- 7. Audit Log
  insert into public.audit_logs (
    action,
    actor_role,
    actor_id,
    registration_id,
    metadata
  ) values (
    'registration.created',
    'participant',
    (v_created_parts->0->>'id')::uuid,
    v_reg_id,
    jsonb_build_object('teamId', p_team_id, 'teamName', btrim(p_team_name), 'memberCount', jsonb_array_length(p_members))
  );

  -- 8. Return composite payload
  v_result := jsonb_build_object(
    'team_id', v_team_id,
    'registration_id', v_reg_id,
    'participants', v_created_parts
  );

  return v_result;
end;
$$;

revoke all on function public.register_team_atomic(text, text, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.register_team_atomic(text, text, text, integer, text, jsonb) to service_role;
