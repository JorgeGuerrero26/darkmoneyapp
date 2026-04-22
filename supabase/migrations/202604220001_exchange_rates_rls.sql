alter table public.exchange_rates enable row level security;

drop policy if exists "exchange_rates_select_authenticated" on public.exchange_rates;
create policy "exchange_rates_select_authenticated"
  on public.exchange_rates
  for select
  using (auth.uid() is not null);

drop policy if exists "exchange_rates_insert_authenticated" on public.exchange_rates;
create policy "exchange_rates_insert_authenticated"
  on public.exchange_rates
  for insert
  with check (auth.uid() is not null);

drop policy if exists "exchange_rates_update_authenticated" on public.exchange_rates;
create policy "exchange_rates_update_authenticated"
  on public.exchange_rates
  for update
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

drop policy if exists "exchange_rates_delete_authenticated" on public.exchange_rates;
create policy "exchange_rates_delete_authenticated"
  on public.exchange_rates
  for delete
  using (auth.uid() is not null);
