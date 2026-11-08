begin;

alter table public.categories
  add column image_url text
    check (
      image_url is null
      or (
        pg_catalog.char_length(image_url) between 1 and 2048
        and image_url ~* '^https://[^[:space:]]+$'
      )
    );

comment on column public.categories.image_url is
  'Optional public HTTPS image URL. The application displays this URL directly and does not proxy or store the image.';

commit;
