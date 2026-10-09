// Récupère les résultats et crédite les points (à lancer toutes les heures).
import { adminClient, isAuthorized, json } from '../_shared/admin.ts';
import { fetchFootballResults, fetchNbaScores, type FootballResult } from '../_shared/providers.ts';
import { settleBet, type BetPick, type MatchResult } from '../_shared/scoring.ts';

// Un match est vérifié au plus tôt 2 h après le coup d'envoi.
const MIN_DELAY_MS = 2 * 3_600_000;

Deno.serve(async (req) => {
  if (!isAuthorized(req)) return json({ error: 'Non autorisé' }, 401);
  const db = adminClient();

  const { data: pending, error } = await db
    .from('matches')
    .select('id, competition')
    .eq('settled', false)
    .lte('kickoff', new Date(Date.now() - MIN_DELAY_MS).toISOString())
    .limit(100);
  if (error) return json({ error: error.message }, 500);
  if (!pending?.length) return json({ ok: true, settled: [] });

  const results = new Map<string, MatchResult>();

  const football = pending.filter((m) => m.competition !== 'nba').map((m) => m.id.replace('fb-', ''));
  if (football.length) {
    const fb = await fetchFootballResults(football);
    for (const [id, r] of fb) {
      if (r.status === 'cancelled') results.set(id, toResult(r));
      else if (r.status === 'finished' && r.homeScore !== null && r.awayScore !== null) results.set(id, toResult(r));
      else await db.from('matches').update({ status: r.status }).eq('id', id);
    }
  }

  if (pending.some((m) => m.competition === 'nba')) {
    const scores = await fetchNbaScores();
    for (const m of pending.filter((p) => p.competition === 'nba')) {
      const s = scores.get(m.id);
      if (s?.completed && s.home !== null && s.away !== null) {
        results.set(m.id, { status: 'finished', homeScore: s.home, awayScore: s.away, starterIds: [], scorerIds: [] });
      } else if (!s) {
        // Match absent du flux 3 jours après : on le considère annulé (remboursement)
        const { data } = await db.from('matches').select('kickoff').eq('id', m.id).single();
        if (data && Date.parse(data.kickoff) < Date.now() - 3 * 86_400_000) {
          results.set(m.id, { status: 'cancelled', homeScore: 0, awayScore: 0, starterIds: [], scorerIds: [] });
        }
      }
    }
  }

  const settled: string[] = [];
  for (const [matchId, result] of results) {
    await db
      .from('matches')
      .update({
        status: result.status,
        home_score: result.status === 'finished' ? result.homeScore : null,
        away_score: result.status === 'finished' ? result.awayScore : null,
      })
      .eq('id', matchId);

    if (result.starterIds.length || result.scorerIds.length) {
      const ids = new Set([...result.starterIds, ...result.scorerIds]);
      await db.from('match_players').upsert(
        [...ids].map((player_id) => ({
          match_id: matchId,
          player_id,
          started: result.starterIds.includes(player_id),
          goals: result.scorerIds.includes(player_id) ? 1 : 0,
        })),
      );
    }

    const { data: bets, error: betsError } = await db
      .from('bets')
      .select('id, pick, odds, exact_home, exact_away, bet_scorers(player_id)')
      .eq('match_id', matchId)
      .eq('status', 'pending');
    if (betsError) return json({ error: betsError.message }, 500);

    for (const b of bets ?? []) {
      const s = settleBet(
        {
          pick: b.pick as BetPick,
          odds: Number(b.odds),
          exactScore: b.exact_home !== null && b.exact_away !== null ? { home: b.exact_home, away: b.exact_away } : null,
          scorerIds: (b.bet_scorers ?? []).map((x: { player_id: string }) => x.player_id),
        },
        result,
      );
      const { error: rpcError } = await db.rpc('apply_settlement', {
        p_bet: b.id,
        p_status: s.void ? 'void' : 'settled',
        p_payout: s.payout,
        p_winner_won: s.winnerWon,
        p_exact_won: s.exactWon,
        p_scorers: s.scorers.map((x) => ({ player_id: x.playerId, outcome: x.outcome })),
      });
      if (rpcError) return json({ error: rpcError.message, matchId }, 500);
    }

    const { error: closeError } = await db.rpc('close_match', { p_match: matchId });
    if (closeError) return json({ error: closeError.message, matchId }, 500);
    settled.push(matchId);
  }

  return json({ ok: true, settled });
});

function toResult(r: FootballResult): MatchResult {
  return {
    status: r.status === 'cancelled' ? 'cancelled' : 'finished',
    homeScore: r.homeScore ?? 0,
    awayScore: r.awayScore ?? 0,
    starterIds: r.starterIds,
    scorerIds: r.scorerIds,
  };
}
