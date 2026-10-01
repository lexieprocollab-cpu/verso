-- Language buddies and private messages (Phase 3, step 26). Like room
-- messages, private messages are written only by the server, which checks the
-- age rule (an under-18 may message an adult only if they follow them), blocks
-- and the profanity filter. Each person reads only their own conversations.

create table public.direct_messages (
  id          bigint generated always as identity primary key,
  sender      uuid not null references auth.users (id) on delete cascade,
  recipient   uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 300),
  hidden      boolean not null default false,
  created_at  timestamptz not null default now(),
  check (sender <> recipient)
);
create index direct_messages_pair on public.direct_messages (least(sender, recipient), greatest(sender, recipient), created_at desc);
create index direct_messages_recipient on public.direct_messages (recipient, created_at desc);

alter table public.direct_messages enable row level security;
create policy "read own conversations" on public.direct_messages for select to authenticated using (
  not hidden
  and (sender = auth.uid() or recipient = auth.uid())
  and not exists (
    select 1 from public.blocks b
    where b.blocker = auth.uid() and b.blocked = case when direct_messages.sender = auth.uid() then direct_messages.recipient else direct_messages.sender end
  )
);

-- Reports cover room messages and private messages: exactly one of the two.
alter table public.reports alter column message_id drop not null;
alter table public.reports add column direct_message_id bigint references public.direct_messages (id) on delete cascade;
alter table public.reports add constraint reports_one_target check ((message_id is null) <> (direct_message_id is null));
alter table public.reports add constraint reports_dm_once unique (direct_message_id, reporter);

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;
