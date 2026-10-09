// Règles du jeu StbSports — source unique partagée par l'application
// (aperçu des gains) et par le serveur (calcul officiel des points).
// Aucun argent réel : uniquement des points entre amis.

export const RULES = {
  startingPoints: 20, // capital de départ de chaque joueur
  targetPoints: 500, // le premier à 500 points gagne
  winnerMultiplier: 10, // pari vainqueur : gain = 10 × cote
  exactScoreStake: 5, // un score exact engage 5 points
  exactScoreBonus: 25, // score exact trouvé : mise rendue + 25 points
  scorerStake: 5, // chaque buteur engage 5 points
  scorerBonus: 25, // buteur trouvé : mise rendue + 25 points
  maxScorers: 3, // nombre maximum de buteurs par pari
} as const;

export type Competition = 'ligue1' | 'ucl' | 'nba';
export type Sport = 'football' | 'basketball';
export type BetPick = 'home' | 'draw' | 'away';

export const COMPETITIONS: Record<Competition, { label: string; short: string; sport: Sport }> = {
  ligue1: { label: 'Ligue 1', short: 'L1', sport: 'football' },
  ucl: { label: 'Ligue des Champions', short: 'LDC', sport: 'football' },
  nba: { label: 'NBA', short: 'NBA', sport: 'basketball' },
};

export interface BetInput {
  pick: BetPick;
  odds: number; // cote figée au moment du pari
  exactScore: { home: number; away: number } | null;
  scorerIds: string[];
}

export interface MatchResult {
  status: 'finished' | 'cancelled';
  homeScore: number;
  awayScore: number;
  starterIds: string[]; // joueurs titulaires (football)
  scorerIds: string[]; // joueurs ayant marqué (hors csc, temps réglementaire)
}

export type ScorerOutcome = 'won' | 'lost' | 'refunded';

export interface Settlement {
  payout: number; // points crédités au joueur lors du règlement
  winnerWon: boolean;
  exactWon: boolean | null; // null si pas de score exact joué
  scorers: { playerId: string; outcome: ScorerOutcome }[];
  void: boolean; // match annulé : tout est remboursé
}

/** Points engagés (débités immédiatement) pour un pari. */
export function stakeFor(bet: Pick<BetInput, 'exactScore' | 'scorerIds'>): number {
  return (bet.exactScore ? RULES.exactScoreStake : 0) + bet.scorerIds.length * RULES.scorerStake;
}

/** Gain du pari vainqueur, arrondi au point le plus proche. */
export function winnerGain(odds: number): number {
  return Math.round(RULES.winnerMultiplier * odds);
}

/** Gain maximum possible si tout est trouvé (mises comprises). */
export function maxPayout(bet: BetInput): number {
  return (
    winnerGain(bet.odds) +
    (bet.exactScore ? RULES.exactScoreStake + RULES.exactScoreBonus : 0) +
    bet.scorerIds.length * (RULES.scorerStake + RULES.scorerBonus)
  );
}

/** Retourne un message d'erreur si le pari est invalide, sinon null. */
export function validateBet(bet: BetInput, sport: Sport, balance: number): string | null {
  if (!(bet.odds > 1)) return "La cote de ce match n'est pas disponible.";
  if (sport === 'basketball') {
    if (bet.pick === 'draw') return "Pas de match nul en NBA.";
    if (bet.exactScore || bet.scorerIds.length) return 'Les bonus ne sont pas disponibles en NBA.';
  }
  if (bet.exactScore) {
    const { home, away } = bet.exactScore;
    if (![home, away].every((n) => Number.isInteger(n) && n >= 0 && n <= 20)) return 'Score exact invalide.';
  }
  if (new Set(bet.scorerIds).size !== bet.scorerIds.length) return 'Un même buteur est choisi deux fois.';
  if (bet.scorerIds.length > RULES.maxScorers) return `${RULES.maxScorers} buteurs maximum.`;
  const stake = stakeFor(bet);
  if (stake > balance) return `Il te faut ${stake} points pour ces bonus (tu en as ${balance}).`;
  return null;
}

export function winningPick(homeScore: number, awayScore: number): BetPick {
  if (homeScore > awayScore) return 'home';
  if (homeScore < awayScore) return 'away';
  return 'draw';
}

/** Calcule les points à créditer une fois le match terminé. */
export function settleBet(bet: BetInput, result: MatchResult): Settlement {
  if (result.status === 'cancelled') {
    return {
      payout: stakeFor(bet),
      winnerWon: false,
      exactWon: bet.exactScore ? false : null,
      scorers: bet.scorerIds.map((playerId) => ({ playerId, outcome: 'refunded' as const })),
      void: true,
    };
  }

  let payout = 0;
  const winnerWon = winningPick(result.homeScore, result.awayScore) === bet.pick;
  if (winnerWon) payout += winnerGain(bet.odds);

  let exactWon: boolean | null = null;
  if (bet.exactScore) {
    exactWon = bet.exactScore.home === result.homeScore && bet.exactScore.away === result.awayScore;
    if (exactWon) payout += RULES.exactScoreStake + RULES.exactScoreBonus;
  }

  const starters = new Set(result.starterIds);
  const scorers = new Set(result.scorerIds);
  const scorerOutcomes = bet.scorerIds.map((playerId) => {
    // Joueur absent ou remplaçant : le buteur ne compte pas, la mise est rendue.
    if (!starters.has(playerId)) {
      payout += RULES.scorerStake;
      return { playerId, outcome: 'refunded' as const };
    }
    if (scorers.has(playerId)) {
      payout += RULES.scorerStake + RULES.scorerBonus;
      return { playerId, outcome: 'won' as const };
    }
    return { playerId, outcome: 'lost' as const };
  });

  return { payout, winnerWon, exactWon, scorers: scorerOutcomes, void: false };
}
