// Exact legacy seed fingerprints verified in development and production.
// No name-only matching; later publications and modified/owned records are excluded.
// One SQL statement keeps deletions and the existing administrative audit atomic.
export const confirmedDemoCleanupSql = `
WITH deleted_profiles AS (
  DELETE FROM artists
  WHERE owner_id IS NULL
    AND created_at = '2026-09-09T07:19:08.876680Z'::timestamptz
    AND profile_group = 'artists'
    AND profile_status = 'approved' AND is_published = 'true'
    AND subcategory IS NULL AND country IS NULL AND website IS NULL
    AND professional_contact IS NULL
    AND specialties = '{}'::text[] AND social_links = '{}'::text[]
    AND (
      (id = 1 AND name = 'Béatrice Londo' AND category = 'Musique'
       AND bio = 'Une voix solaire entre Bangui et la diaspora.'
       AND location = 'Bangui, RCA' AND works_count = 3
       AND avatar = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80')
      OR
      (id = 2 AND name = 'Mikaël Gbaï' AND category = 'Humour'
       AND bio = 'Des histoires du quotidien racontées avec tendresse.'
       AND location = 'Paris, France' AND works_count = 2
       AND avatar = 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=300&q=80')
    )
  RETURNING id, name
), deleted_works AS (
  DELETE FROM works
  WHERE created_at = '2026-09-09T07:19:08.901329Z'::timestamptz
    AND media_type IS NULL AND media_object_path IS NULL AND cover_object_path IS NULL
    AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.published_work_id = works.id)
    AND (
      (id = 1 AND title = 'Bangui la belle' AND artist = 'Béatrice Londo'
       AND category = 'Musique' AND description = 'Un voyage musical entre mémoire, douceur et énergie.'
       AND duration = '3:42' AND featured = 'true' AND access = 'free'
       AND image = 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80')
      OR
      (id = 2 AND title = 'Rire en famille' AND artist = 'Mikaël Gbaï'
       AND category = 'Humour' AND description = 'Le nouveau spectacle qui fait rire toute la communauté.'
       AND duration = '18:20' AND featured = 'true' AND access = 'premium'
       AND image = 'https://images.unsplash.com/photo-1527224857830-43a7acc85260?auto=format&fit=crop&w=900&q=80')
    )
  RETURNING id, title
), deleted_submissions AS (
  DELETE FROM submissions
  WHERE submitted_at = '2026-09-09T07:19:08.905470Z'::timestamptz
    AND owner_id IS NULL AND media_type IS NULL
    AND media_object_path IS NULL AND cover_object_path IS NULL
    AND duration IS NULL AND published_work_id IS NULL
    AND (
      (id = 1 AND title = 'Nzelé' AND artist = 'Béatrice Londo'
       AND category = 'Musique' AND status = 'approved'
       AND note = 'Single afro-fusion à découvrir.')
      OR
      (id = 3 AND title = 'Le quartier se réveille' AND artist = 'Mikaël Gbaï'
       AND category = 'Humour' AND status = 'approved'
       AND note = 'Prêt pour publication.')
    )
  RETURNING id, title
), audit AS (
  INSERT INTO admin_audit_logs (administrator_id, action, entity_type, entity_id, target_label, result)
  SELECT $1, 'demo_cleanup', 'profile', id::text, name, 'success' FROM deleted_profiles
  UNION ALL
  SELECT $1, 'demo_cleanup', 'work', id::text, title, 'success' FROM deleted_works
  UNION ALL
  SELECT $1, 'demo_cleanup', 'submission', id::text, title, 'success' FROM deleted_submissions
  RETURNING id
)
SELECT (SELECT count(*)::integer FROM deleted_profiles) AS profiles,
       (SELECT count(*)::integer FROM deleted_works) AS works,
       (SELECT count(*)::integer FROM deleted_submissions) AS submissions,
       (SELECT count(*)::integer FROM audit) AS audited
`;