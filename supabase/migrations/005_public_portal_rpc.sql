create or replace function public.get_public_portal_snapshot(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
  share_uuid uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;

  select s.id,
    jsonb_build_object(
      'share', jsonb_build_object(
        'id', s.id,
        'clientName', s.client_name,
        'expiresAt', s.expires_at
      ),
      'procurement', case when p.id is null then null else jsonb_build_object(
        'controlNumber', p.control_number,
        'objectDescription', p.object_description,
        'statusName', p.status_name,
        'publishedAt', p.published_at
      ) end,
      'messages', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', m.id,
          'senderType', m.sender_type,
          'senderName', m.sender_name,
          'body', m.body,
          'createdAt', m.created_at
        ) order by m.created_at)
        from public.portal_messages m where m.share_id = s.id
      ), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'title', e.title,
          'description', e.description,
          'eventType', e.event_type,
          'createdAt', e.created_at
        ) order by e.created_at desc)
        from public.process_events e
        where e.opportunity_id = s.opportunity_id and e.visibility = 'client'
      ), '[]'::jsonb),
      'documentRequests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id,
          'title', d.title,
          'description', d.description,
          'status', d.status,
          'dueAt', d.due_at,
          'maxSizeBytes', d.max_size_bytes,
          'allowedMimeTypes', d.allowed_mime_types
        ) order by d.created_at desc)
        from public.document_requests d where d.share_id = s.id
      ), '[]'::jsonb)
    )
  into share_uuid, payload
  from public.client_portal_shares s
  left join public.procurements p on p.id = s.procurement_id
  where s.token_hash = p_token_hash
    and s.revoked_at is null
    and s.expires_at > now();

  if share_uuid is not null then
    update public.client_portal_shares set last_accessed_at = now() where id = share_uuid;
  end if;
  return payload;
end;
$$;

create or replace function public.send_public_portal_message(
  p_token_hash text,
  p_sender_name text,
  p_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  portal_share public.client_portal_shares%rowtype;
  message_uuid uuid;
  recent_count integer;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$'
    or char_length(trim(p_sender_name)) not between 2 and 120
    or char_length(trim(p_body)) not between 1 and 4000 then
    raise exception 'INVALID_PORTAL_MESSAGE';
  end if;

  select * into portal_share
  from public.client_portal_shares
  where token_hash = p_token_hash and revoked_at is null and expires_at > now();
  if portal_share.id is null then raise exception 'PORTAL_NOT_FOUND'; end if;

  select count(*) into recent_count from public.portal_messages
  where share_id = portal_share.id and sender_type = 'client' and created_at > now() - interval '1 minute';
  if recent_count >= 10 then raise exception 'PORTAL_RATE_LIMIT'; end if;

  insert into public.portal_messages (tenant_id, share_id, sender_type, sender_name, body)
  values (portal_share.tenant_id, portal_share.id, 'client', trim(p_sender_name), trim(p_body))
  returning id into message_uuid;
  return message_uuid;
end;
$$;

revoke all on function public.get_public_portal_snapshot(text) from public;
revoke all on function public.send_public_portal_message(text, text, text) from public;
grant execute on function public.get_public_portal_snapshot(text) to anon, authenticated;
grant execute on function public.send_public_portal_message(text, text, text) to anon, authenticated;
