-- Allow ₹1,500 (150000 paise) registration fee
alter table public.registrations drop constraint if exists registrations_fee_amount_check;
alter table public.registrations
  add constraint registrations_fee_amount_check
  check (fee_amount in (50000, 100000, 120000, 150000));

alter table public.registrations
  alter column fee_amount set default 150000;
