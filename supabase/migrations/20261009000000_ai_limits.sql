-- Daily AI request counts, so one person cannot run up the Claude bill.
-- `subject` is "user:<id>" for signed-in learners and "ip:<hash>" for guests.
-- Written only by the server (service role); nobody can read it through the API.
create table public.ai_usage (
  subject  text not null check (char_length(subject) <= 100),
  day      date not null default current_date,
  count    integer not null default 0,
  primary key (subject, day)
);

alter table public.ai_usage enable row level security;
-- No policies: anon and authenticated roles can neither read nor write.

-- Counts one AI request for `p_subject` today. Returns false, without
-- counting, once the subject has used `p_limit` requests today.
create function public.take_ai_request(p_subject text, p_limit integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  used integer;
begin
  insert into public.ai_usage as u (subject, day, count)
    values (p_subject, current_date, 1)
    on conflict (subject, day) do update set count = u.count + 1
      where u.count < p_limit
    returning u.count into used;
  -- Old days are no longer needed; keep the table small.
  if used = 1 then
    delete from public.ai_usage where day < current_date - 7;
  end if;
  return used is not null;
end;
$$;

revoke execute on function public.take_ai_request(text, integer) from public, anon, authenticated;
