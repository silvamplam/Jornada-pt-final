-- Test-only auxiliary identities. Newsroom tables/functions are loaded verbatim
-- from the repository's real foundations by run.py. No production data or secrets.
DO $guard$
BEGIN
 IF current_database() <> 'mesa_organization_test' OR
    inet_server_addr() IS NOT NULL OR
    current_setting('server_version_num')::integer NOT BETWEEN 170000 AND 179999
 THEN RAISE EXCEPTION 'isolated PostgreSQL 17 test database required'; END IF;
END;
$guard$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
-- Only the FK/context fields used by newsroom are needed for these unrelated
-- authorities. Publishing, sports operations and historical projections are
-- deliberately outside this SQL integration test, not mocked as successful.
CREATE TABLE public.competitions(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.seasons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), competition_id uuid REFERENCES public.competitions(id));
CREATE TABLE public.matchdays(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), season_id uuid REFERENCES public.seasons(id));
CREATE TABLE public.matches(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), competition_id uuid REFERENCES public.competitions(id), season_id uuid REFERENCES public.seasons(id), matchday_id uuid REFERENCES public.matchdays(id));
CREATE TABLE public.editorial_articles(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text NOT NULL, slug text UNIQUE,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published')),
 scope text, label text, subtitle text, body text, image_url text, image_caption text,
 author text, published_at timestamptz, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
 competition_id uuid REFERENCES public.competitions(id), season_id uuid REFERENCES public.seasons(id), matchday_id uuid REFERENCES public.matchdays(id)
);
ALTER TABLE public.editorial_articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.editorial_articles FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.editorial_articles FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.editorial_articles TO service_role;
GRANT SELECT ON public.competitions,public.seasons,public.matchdays,public.matches TO service_role;
