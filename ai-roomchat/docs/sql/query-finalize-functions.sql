-- List finalize functions and their definitions
SELECT n.nspname as schema,
       p.proname as function_name,
       pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname ILIKE 'finalize_rank_session_outcome%'
ORDER BY n.nspname, p.proname;
