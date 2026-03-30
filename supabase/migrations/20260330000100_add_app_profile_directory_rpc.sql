/*
  # Add app profile directory RPC for questionnaire creators

  Allows authenticated clients to resolve questionnaire authors without opening
  direct client-side access to the full `app_profiles` table.
*/

CREATE OR REPLACE FUNCTION public.get_app_profile_directory(requested_user_ids uuid[] DEFAULT NULL)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  role text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    profile.user_id,
    profile.email,
    profile.full_name,
    profile.role
  FROM public.app_profiles AS profile
  WHERE requested_user_ids IS NULL
    OR profile.user_id = ANY(requested_user_ids)
  ORDER BY COALESCE(NULLIF(profile.full_name, ''), profile.email), profile.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_app_profile_directory(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_app_profile_directory(uuid[]) TO authenticated;
