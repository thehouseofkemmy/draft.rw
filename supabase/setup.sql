-- ============================================================
-- drafts.rw — complete database setup
-- Paste this entire file into Supabase SQL Editor and run it.
-- Safe to run on a fresh project. Do NOT run on a project that
-- already has a "drafts" table.
-- ============================================================

-- ── ENUMS ──────────────────────────────────────────────────
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- ── HELPER: set_updated_at (no table dependency) ───────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ── USER ROLES (must exist before has_role) ────────────────
CREATE TABLE public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ── has_role (defined after user_roles table exists) ───────
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;

CREATE POLICY "roles readable by self or admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ── PROFILES ───────────────────────────────────────────────
CREATE TABLE public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle       TEXT UNIQUE,
  display_name TEXT,
  avatar_url   TEXT,
  cover_url    TEXT,
  bio          TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles public read"     ON public.profiles FOR SELECT USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── DRAFTS ─────────────────────────────────────────────────
CREATE TABLE public.drafts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT '',
  content      TEXT NOT NULL,
  excerpt      TEXT,
  published    BOOLEAN NOT NULL DEFAULT true,
  reply_to_id  UUID REFERENCES public.drafts(id) ON DELETE CASCADE,
  quote_of_id  UUID REFERENCES public.drafts(id) ON DELETE SET NULL,
  pinned       BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.drafts ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER drafts_updated_at BEFORE UPDATE ON public.drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "drafts read" ON public.drafts FOR SELECT
  USING (published = true OR public.has_role(auth.uid(), 'admin') OR auth.uid() = author_id);
CREATE POLICY "users insert own drafts" ON public.drafts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);
CREATE POLICY "users update own drafts" ON public.drafts FOR UPDATE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "users delete own drafts" ON public.drafts FOR DELETE TO authenticated
  USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));

-- ── COMMENTS ───────────────────────────────────────────────
CREATE TABLE public.comments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments public read"      ON public.comments FOR SELECT USING (true);
CREATE POLICY "users insert own comments" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own comments" ON public.comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ── LIKES ──────────────────────────────────────────────────
CREATE TABLE public.likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, user_id)
);
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes public read"      ON public.likes FOR SELECT USING (true);
CREATE POLICY "users insert own likes" ON public.likes FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own likes" ON public.likes FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── REPOSTS ────────────────────────────────────────────────
CREATE TABLE public.reposts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, user_id)
);
ALTER TABLE public.reposts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reposts public read"      ON public.reposts FOR SELECT USING (true);
CREATE POLICY "users insert own reposts" ON public.reposts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own reposts" ON public.reposts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── FOLLOWS ────────────────────────────────────────────────
CREATE TABLE public.follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id != following_id)
);
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "follows public read"      ON public.follows FOR SELECT USING (true);
CREATE POLICY "users insert own follows" ON public.follows FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = follower_id);
CREATE POLICY "users delete own follows" ON public.follows FOR DELETE TO authenticated
  USING (auth.uid() = follower_id);

-- ── NOTIFICATIONS ──────────────────────────────────────────
CREATE TABLE public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type         TEXT NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'repost')),
  draft_id     UUID REFERENCES public.drafts(id) ON DELETE CASCADE,
  read         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own notifications"   ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = to_user_id);
CREATE POLICY "users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = to_user_id);
CREATE POLICY "anyone insert notifications"    ON public.notifications
  FOR INSERT WITH CHECK (true);

-- ── BOOKMARKS ──────────────────────────────────────────────
CREATE TABLE public.bookmarks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id   UUID NOT NULL REFERENCES public.drafts(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (draft_id, user_id)
);
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own bookmarks"    ON public.bookmarks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own bookmarks"  ON public.bookmarks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users delete own bookmarks"  ON public.bookmarks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ── SUBSCRIBERS ────────────────────────────────────────────
CREATE TABLE public.subscribers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone can subscribe"     ON public.subscribers FOR INSERT WITH CHECK (true);
CREATE POLICY "admins read subscribers"  ON public.subscribers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ── DRAFT STATS VIEW ───────────────────────────────────────
-- Convenient per-draft counts for likes, comments, reposts
CREATE OR REPLACE VIEW public.draft_stats AS
SELECT
  d.id,
  COUNT(DISTINCT l.id) AS like_count,
  COUNT(DISTINCT c.id) AS comment_count,
  COUNT(DISTINCT r.id) AS repost_count
FROM public.drafts d
LEFT JOIN public.likes    l ON l.draft_id = d.id
LEFT JOIN public.comments c ON c.draft_id = d.id
LEFT JOIN public.reposts  r ON r.draft_id = d.id
GROUP BY d.id;

-- ── NOTIFICATION TRIGGERS ──────────────────────────────────
-- like → notify author
CREATE OR REPLACE FUNCTION public.notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  SELECT author_id INTO v_author FROM public.drafts WHERE id = NEW.draft_id;
  IF v_author IS NOT NULL AND v_author != NEW.user_id THEN
    INSERT INTO public.notifications (to_user_id, from_user_id, type, draft_id)
    VALUES (v_author, NEW.user_id, 'like', NEW.draft_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_like AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

-- comment → notify author
CREATE OR REPLACE FUNCTION public.notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  SELECT author_id INTO v_author FROM public.drafts WHERE id = NEW.draft_id;
  IF v_author IS NOT NULL AND v_author != NEW.user_id THEN
    INSERT INTO public.notifications (to_user_id, from_user_id, type, draft_id)
    VALUES (v_author, NEW.user_id, 'comment', NEW.draft_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

-- follow → notify followed user
CREATE OR REPLACE FUNCTION public.notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (to_user_id, from_user_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_follow AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

-- repost → notify author
CREATE OR REPLACE FUNCTION public.notify_on_repost()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_author UUID;
BEGIN
  SELECT author_id INTO v_author FROM public.drafts WHERE id = NEW.draft_id;
  IF v_author IS NOT NULL AND v_author != NEW.user_id THEN
    INSERT INTO public.notifications (to_user_id, from_user_id, type, draft_id)
    VALUES (v_author, NEW.user_id, 'repost', NEW.draft_id);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_repost AFTER INSERT ON public.reposts
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_repost();

-- ── STORAGE: AVATARS BUCKET ────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "users upload own avatar" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users update own avatar" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "users delete own avatar" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
