CREATE OR REPLACE FUNCTION public.fix_mojibake(t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  res text := '';
  pos int := 1;
  len int;
  ch  text;
  code int;
  run text;
  dec text;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  len := length(t);
  WHILE pos <= len LOOP
    ch := substr(t, pos, 1);
    code := ascii(ch);
    IF code >= 128 THEN
      run := '';
      WHILE pos <= len LOOP
        ch := substr(t, pos, 1);
        code := ascii(ch);
        EXIT WHEN code < 128;
        run := run || ch;
        pos := pos + 1;
      END LOOP;
      dec := NULL;
      BEGIN
        dec := convert_from(convert_to(run, 'LATIN1'), 'UTF8');
      EXCEPTION WHEN OTHERS THEN
        dec := NULL;
      END;
      IF dec IS NULL THEN
        BEGIN
          dec := convert_from(convert_to(run, 'WIN1252'), 'UTF8');
        EXCEPTION WHEN OTHERS THEN
          dec := run;
        END;
      END IF;
      res := res || dec;
    ELSE
      res := res || ch;
      pos := pos + 1;
    END IF;
  END LOOP;
  RETURN res;
END;
$function$;