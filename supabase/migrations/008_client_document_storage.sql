insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-documents',
  'client-documents',
  false,
  26214400,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy client_documents_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-documents'
    and exists (
      select 1 from public.client_portal_shares s
      where s.id::text = (storage.foldername(name))[1]
        and public.is_tenant_member(s.tenant_id)
    )
  );

create policy client_documents_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'client-documents'
    and exists (
      select 1 from public.client_portal_shares s
      where s.id::text = (storage.foldername(name))[1]
        and public.has_tenant_role(s.tenant_id, array['owner','admin']::public.user_role[])
    )
  );
