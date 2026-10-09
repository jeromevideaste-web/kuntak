-- Planification des mises à jour (à exécuter une fois dans Supabase > SQL Editor,
-- après avoir activé les extensions pg_cron et pg_net dans Database > Extensions).
-- Remplacer <PROJET> par l'identifiant du projet et <CRON_SECRET> par le secret choisi.

-- Matchs et cotes : à 6 h et 14 h UTC
select cron.schedule('stb-sync-matches', '0 6,14 * * *', $$
  select net.http_post(
    url := 'https://<PROJET>.supabase.co/functions/v1/sync-matches',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb
  );
$$);

-- Résultats et points : toutes les heures
select cron.schedule('stb-settle-matches', '15 * * * *', $$
  select net.http_post(
    url := 'https://<PROJET>.supabase.co/functions/v1/settle-matches',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "<CRON_SECRET>"}'::jsonb
  );
$$);
