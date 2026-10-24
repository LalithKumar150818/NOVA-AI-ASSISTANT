create table if not exists public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users (id) on delete cascade,
    title text not null check (char_length(title) between 1 and 80),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists conversations_user_updated_idx
    on public.conversations (user_id, updated_at desc);

create table if not exists public.profiles (
    id uuid primary key references auth.users (id) on delete cascade,
    email text not null,
    display_name text not null default '',
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "Users can read their profile" on public.profiles;
create policy "Users can read their profile"
    on public.profiles for select to authenticated
    using ((select auth.uid()) = id);

drop policy if exists "Users can update their profile" on public.profiles;
create policy "Users can update their profile"
    on public.profiles for update to authenticated
    using ((select auth.uid()) = id)
    with check ((select auth.uid()) = id);

create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    insert into public.profiles (id, email)
    values (new.id, coalesce(new.email, ''))
    on conflict (id) do update set email = excluded.email;
    return new;
end;
$$;

revoke all on function public.handle_auth_user_profile() from public;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
    after insert or update of email on auth.users
    for each row execute function public.handle_auth_user_profile();

insert into public.profiles (id, email)
select id, coalesce(email, '')
from auth.users
on conflict (id) do update set email = excluded.email;

create table if not exists public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    position integer not null check (position >= 0),
    role text not null check (role in ('user', 'assistant')),
    content text not null check (char_length(content) between 1 and 15000),
    metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz not null default now(),
    unique (conversation_id, position)
);

create index if not exists messages_conversation_position_idx
    on public.messages (conversation_id, position);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, delete on public.messages to authenticated;

drop policy if exists "Users can read their conversations" on public.conversations;
create policy "Users can read their conversations"
    on public.conversations for select to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their conversations" on public.conversations;
create policy "Users can create their conversations"
    on public.conversations for insert to authenticated
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their conversations" on public.conversations;
create policy "Users can update their conversations"
    on public.conversations for update to authenticated
    using ((select auth.uid()) = user_id)
    with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their conversations" on public.conversations;
create policy "Users can delete their conversations"
    on public.conversations for delete to authenticated
    using ((select auth.uid()) = user_id);

drop policy if exists "Users can read messages in their conversations" on public.messages;
create policy "Users can read messages in their conversations"
    on public.messages for select to authenticated
    using (
        exists (
            select 1
            from public.conversations
            where conversations.id = messages.conversation_id
              and conversations.user_id = (select auth.uid())
        )
    );

drop policy if exists "Users can create messages in their conversations" on public.messages;
create policy "Users can create messages in their conversations"
    on public.messages for insert to authenticated
    with check (
        exists (
            select 1
            from public.conversations
            where conversations.id = messages.conversation_id
              and conversations.user_id = (select auth.uid())
        )
    );

drop policy if exists "Users can delete messages in their conversations" on public.messages;
create policy "Users can delete messages in their conversations"
    on public.messages for delete to authenticated
    using (
        exists (
            select 1
            from public.conversations
            where conversations.id = messages.conversation_id
              and conversations.user_id = (select auth.uid())
        )
    );

create or replace function public.replace_conversation_messages(
    p_conversation_id uuid,
    p_messages jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
    message_record record;
    saved_count integer := 0;
begin
    if jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) > 50 then
        raise exception 'Conversation history must contain at most 50 messages.'
            using errcode = '22023';
    end if;

    if not exists (
        select 1
        from public.conversations
        where id = p_conversation_id
          and user_id = (select auth.uid())
    ) then
        raise exception 'Conversation not found.' using errcode = '42501';
    end if;

    delete from public.messages
    where conversation_id = p_conversation_id;

    for message_record in
        select value, ordinality
        from jsonb_array_elements(p_messages) with ordinality
    loop
        if jsonb_typeof(message_record.value) <> 'object'
            or message_record.value ->> 'role' not in ('user', 'assistant')
            or char_length(coalesce(message_record.value ->> 'content', '')) not between 1 and 15000
            or jsonb_typeof(coalesce(message_record.value -> 'metadata', '{}'::jsonb)) <> 'object'
        then
            raise exception 'The conversation contains an invalid message.'
                using errcode = '22023';
        end if;

        insert into public.messages (
            conversation_id, position, role, content, metadata
        ) values (
            p_conversation_id,
            message_record.ordinality - 1,
            message_record.value ->> 'role',
            message_record.value ->> 'content',
            coalesce(message_record.value -> 'metadata', '{}'::jsonb)
        );
        saved_count := saved_count + 1;
    end loop;

    return jsonb_build_object('saved', saved_count);
end;
$$;

revoke all on function public.replace_conversation_messages(uuid, jsonb) from public;
grant execute on function public.replace_conversation_messages(uuid, jsonb) to authenticated;
