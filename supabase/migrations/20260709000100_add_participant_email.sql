/*
  # Add participant email

  Adds an optional email field for employees submitted through public
  questionnaires and edited by coordinators in the admin interface.
*/

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '';
