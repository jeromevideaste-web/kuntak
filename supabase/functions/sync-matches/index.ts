// Récupère les matchs à venir et leurs cotes (à lancer 2 fois par jour).
import { adminClient, isAuthorized, json } from '../_shared/admin.ts';
import { fetchFootballMatches, fetchNbaMatches, fetchSquad, FOOTBALL_LEAGUES, type MatchRow } from '../_shared/providers.ts';
import type { Competition } from '../_shared/scoring.ts';

const DAYS_AHEAD = 7;
const MAX_SQUADS_PER_RUN = 12;

Deno.serve(async (req) => {
  if (!isAuthorized(req)) return json({ error: 'Non autorisé' }, 401);
  const db = adminClient();
  const report: Record<string, unknown> = {};
  const rows: MatchRow[] = [];

  for (const competition of Object.keys(FOOTBALL_LEAGUES) as Competition[]) {
    try {
      const matches = await fetchFootballMatches(competition, DAYS_AHEAD);
      rows.push(...matches);
      report[competition] = matches.length;
    } catch (e) {
      report[competition] = `erreur : ${(e as Error).message}`;
    }
  }
  try {
    const nba = await fetchNbaMatches();
    rows.push(...nba);
    report.nba = nba.length;
  } catch (e) {
    report.nba = `erreur : ${(e as Error).message}`;
  }

  // Une cote qui disparaît juste avant le match ne doit pas effacer la dernière connue.
  const withOdds = rows.filter((r) => r.odds_home !== null);
  const withoutOdds = rows
    .filter((r) => r.odds_home === null)
    .map(({ odds_home: _h, odds_draw: _d, odds_away: _a, ...rest }) => rest);
  // Les scores sont écrits uniquement par settle-matches.
  const strip = <T extends Partial<MatchRow>>({ home_score: _h, away_score: _a, status: _s, ...rest }: T) => rest;
  for (const batch of [withOdds.map(strip), withoutOdds.map(strip)]) {
    if (!batch.length) continue;
    const { error } = await db.from('matches').upsert(batch.map((r) => ({ ...r, updated_at: new Date().toISOString() })));
    if (error) return json({ error: error.message, report }, 500);
  }
  // Statut « annulé » (match reporté) remonté immédiatement
  const cancelled = rows.filter((r) => r.status === 'cancelled').map((r) => r.id);
  if (cancelled.length) await db.from('matches').update({ status: 'cancelled' }).in('id', cancelled);

  // Effectifs des équipes pas encore connues (pour choisir les buteurs)
  const teamIds = [...new Set(rows.flatMap((r) => [r.home_team_ext_id, r.away_team_ext_id]).filter(Boolean))] as string[];
  const { data: known } = await db.from('players').select('team_ext_id').in('team_ext_id', teamIds);
  const knownTeams = new Set((known ?? []).map((p) => p.team_ext_id));
  const missing = teamIds.filter((t) => !knownTeams.has(t)).slice(0, MAX_SQUADS_PER_RUN);
  for (const team of missing) {
    try {
      const players = await fetchSquad(team);
      if (players.length) await db.from('players').upsert(players);
    } catch (e) {
      report[`squad-${team}`] = (e as Error).message;
    }
  }
  report.squads = missing.length;

  return json({ ok: true, report });
});
