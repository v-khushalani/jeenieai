-- Study Notes
CREATE TABLE public.study_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  title text NOT NULL,
  subject text,
  class_level integer,
  exam_relevance text[] DEFAULT '{}',
  content_md text NOT NULL DEFAULT '',
  reading_time_minutes integer DEFAULT 1,
  display_order integer DEFAULT 0,
  is_published boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.study_notes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_notes TO authenticated;
GRANT ALL ON public.study_notes TO service_role;

ALTER TABLE public.study_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read published study_notes" ON public.study_notes
  FOR SELECT USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "admin manage study_notes" ON public.study_notes
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_study_notes_chapter ON public.study_notes(chapter_id);
CREATE INDEX idx_study_notes_topic ON public.study_notes(topic_id);

CREATE TRIGGER update_study_notes_updated_at
  BEFORE UPDATE ON public.study_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Concept Maps
CREATE TABLE public.concept_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id uuid REFERENCES public.chapters(id) ON DELETE CASCADE,
  topic_id uuid REFERENCES public.topics(id) ON DELETE SET NULL,
  title text NOT NULL,
  subject text,
  nodes jsonb DEFAULT '[]'::jsonb,
  edges jsonb DEFAULT '[]'::jsonb,
  is_published boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

GRANT SELECT ON public.concept_maps TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.concept_maps TO authenticated;
GRANT ALL ON public.concept_maps TO service_role;

ALTER TABLE public.concept_maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read published concept_maps" ON public.concept_maps
  FOR SELECT USING (is_published = true OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "admin manage concept_maps" ON public.concept_maps
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_concept_maps_chapter ON public.concept_maps(chapter_id);
CREATE INDEX idx_concept_maps_topic ON public.concept_maps(topic_id);

CREATE TRIGGER update_concept_maps_updated_at
  BEFORE UPDATE ON public.concept_maps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();