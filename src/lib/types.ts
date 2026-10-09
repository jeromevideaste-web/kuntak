import type { BetPick, Competition, ScorerOutcome } from '@shared/scoring';

export interface Profile {
  id: string;
  username: string;
}

export interface Group {
  id: string;
  name: string;
  code: string;
  competitions: Competition[];
  ownerId: string;
  season: number;
  status: 'active' | 'finished';
  winnerId: string | null;
}

export interface GroupSummary extends Group {
  myPoints: number;
  memberCount: number;
}

export interface Member {
  userId: string;
  username: string;
  points: number;
}

export interface Match {
  id: string;
  competition: Competition;
  homeTeam: string;
  awayTeam: string;
  homeTeamExtId: string | null;
  awayTeamExtId: string | null;
  homeLogo: string | null;
  awayLogo: string | null;
  kickoff: string;
  odds: { home: number | null; draw: number | null; away: number | null };
  status: 'scheduled' | 'live' | 'finished' | 'cancelled';
  homeScore: number | null;
  awayScore: number | null;
}

export interface Player {
  id: string;
  teamExtId: string;
  name: string;
  position: string | null;
  number: number | null;
}

export interface Bet {
  id: string;
  groupId: string;
  userId: string;
  matchId: string;
  pick: BetPick;
  odds: number;
  exactScore: { home: number; away: number } | null;
  stake: number;
  status: 'pending' | 'settled' | 'void';
  payout: number | null;
  winnerWon: boolean | null;
  exactWon: boolean | null;
  scorers: { playerId: string; outcome: ScorerOutcome | null }[];
}

export interface BetRequest {
  pick: BetPick;
  exactScore: { home: number; away: number } | null;
  scorerIds: string[];
}

export interface Backend {
  mode: 'demo' | 'live';
  getProfile(): Promise<Profile | null>;
  onAuthChange(cb: (profile: Profile | null) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signUp(email: string, password: string, username: string): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;

  listGroups(): Promise<GroupSummary[]>;
  createGroup(name: string, competitions: Competition[]): Promise<Group>;
  joinGroup(code: string): Promise<Group>;
  getGroup(id: string): Promise<{ group: Group; members: Member[] }>;
  restartGroup(id: string): Promise<void>;
  leaveGroup(id: string): Promise<void>;

  listMatches(competitions: Competition[]): Promise<Match[]>;
  getMatch(id: string): Promise<Match>;
  listPlayers(teamExtIds: string[]): Promise<Player[]>;
  /** Paris visibles de la partie en cours : les miens + ceux des amis après le coup d'envoi. */
  listBets(groupId: string): Promise<Bet[]>;
  placeBet(groupId: string, matchId: string, bet: BetRequest): Promise<void>;

  /** Mode démo uniquement : termine les matchs pariés avec des scores aléatoires. */
  simulateResults?(): Promise<number>;
}
