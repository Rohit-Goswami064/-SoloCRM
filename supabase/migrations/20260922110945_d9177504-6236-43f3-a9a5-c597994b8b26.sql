ALTER TABLE public.leads ALTER COLUMN deal_value DROP NOT NULL;
ALTER TABLE public.leads ALTER COLUMN deal_value DROP DEFAULT;
ALTER TABLE public.leads ALTER COLUMN name DROP NOT NULL;
ALTER TABLE public.leads ALTER COLUMN temperature DROP NOT NULL;

ALTER TABLE public.custom_field_defs
  ADD COLUMN IF NOT EXISTS field_type text NOT NULL DEFAULT 'TEXT',
  ADD COLUMN IF NOT EXISTS options text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.custom_field_defs_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  if new.field_type not in ('TEXT','NUMBER','URL','EMAIL','PHONE','DATE','BOOLEAN','SELECT') then
    raise exception 'Unsupported field type: %', new.field_type;
  end if;
  return new;
end $$;

DROP TRIGGER IF EXISTS custom_field_defs_validate_trg ON public.custom_field_defs;
CREATE TRIGGER custom_field_defs_validate_trg
BEFORE INSERT OR UPDATE ON public.custom_field_defs
FOR EACH ROW EXECUTE FUNCTION public.custom_field_defs_validate();