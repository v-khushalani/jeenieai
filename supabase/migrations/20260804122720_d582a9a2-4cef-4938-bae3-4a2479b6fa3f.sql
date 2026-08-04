CREATE OR REPLACE FUNCTION public.mojibake_byte(ch text)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE ascii(ch)
    WHEN 8364 THEN 128 WHEN 8218 THEN 130 WHEN 402 THEN 131 WHEN 8222 THEN 132
    WHEN 8230 THEN 133 WHEN 8224 THEN 134 WHEN 8225 THEN 135 WHEN 710 THEN 136
    WHEN 8240 THEN 137 WHEN 352 THEN 138 WHEN 8249 THEN 139 WHEN 338 THEN 140
    WHEN 381 THEN 142 WHEN 8216 THEN 145 WHEN 8217 THEN 146 WHEN 8220 THEN 147
    WHEN 8221 THEN 148 WHEN 8226 THEN 149 WHEN 8211 THEN 150 WHEN 8212 THEN 151
    WHEN 732 THEN 152 WHEN 8482 THEN 153 WHEN 353 THEN 154 WHEN 8250 THEN 155
    WHEN 339 THEN 156 WHEN 382 THEN 158 WHEN 376 THEN 159
    ELSE CASE WHEN ascii(ch) < 256 THEN ascii(ch) ELSE NULL END
  END;
$$;

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
  bytes bytea;
  b int;
  k int;
  ok boolean;
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

      ok := true;
      bytes := ''::bytea;
      FOR k IN 1..length(run) LOOP
        b := public.mojibake_byte(substr(run, k, 1));
        IF b IS NULL THEN ok := false; EXIT; END IF;
        bytes := bytes || set_byte('\x00'::bytea, 0, b);
      END LOOP;

      dec := NULL;
      IF ok THEN
        BEGIN
          dec := convert_from(bytes, 'UTF8');
        EXCEPTION WHEN OTHERS THEN
          dec := NULL;
        END;
      END IF;
      res := res || COALESCE(dec, run);
    ELSE
      res := res || ch;
      pos := pos + 1;
    END IF;
  END LOOP;
  RETURN res;
END;
$function$;