CREATE OR REPLACE FUNCTION public.fix_mojibake(t text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  res text := '';
  buf text := '';
  ch  text;
  i   int;
  dec text;
BEGIN
  IF t IS NULL THEN RETURN NULL; END IF;
  FOR i IN 1..length(t) LOOP
    ch := substr(t, i, 1);
    IF ascii(ch) BETWEEN 1 AND 255 THEN
      buf := buf || ch;
    ELSE
      IF buf <> '' THEN
        BEGIN
          dec := convert_from(convert_to(buf, 'LATIN1'), 'UTF8');
        EXCEPTION WHEN OTHERS THEN
          dec := buf;
        END;
        res := res || dec;
        buf := '';
      END IF;
      res := res || ch;
    END IF;
  END LOOP;
  IF buf <> '' THEN
    BEGIN
      dec := convert_from(convert_to(buf, 'LATIN1'), 'UTF8');
    EXCEPTION WHEN OTHERS THEN
      dec := buf;
    END;
    res := res || dec;
  END IF;
  RETURN res;
END;
$$;