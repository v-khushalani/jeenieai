
REVOKE EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid, text, text, uuid, uuid, text, uuid[], int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fetch_unseen_questions(uuid, text, text, uuid, uuid, text, uuid[], int) TO authenticated, service_role;
