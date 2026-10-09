// Mode démo : tout se passe dans la mémoire du téléphone, sans serveur.
// Permet d'essayer l'application avant de brancher Supabase et les API sportives.
import { COMPETITIONS, RULES, settleBet, stakeFor, validateBet, type Competition } from '@shared/scoring';
import type { Backend, Bet, Group, Match, Member, Player, Profile } from './types';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const TEAMS: Record<Competition, [string, string][]> = {
  ligue1: [
    ['Paris SG', 'Marseille'],
    ['Lyon', 'Lille'],
    ['Monaco', 'Rennes'],
    ['Lens', 'Nice'],
  ],
  ucl: [
    ['Real Madrid', 'Paris SG'],
    ['Bayern Munich', 'Arsenal'],
    ['Inter', 'Barcelone'],
  ],
  nba: [
    ['Lakers', 'Celtics'],
    ['Warriors', 'Knicks'],
    ['Spurs', 'Nuggets'],
  ],
};

const FIRST = ['L.', 'K.', 'M.', 'T.', 'A.', 'J.', 'R.', 'N.', 'S.', 'Y.', 'B.'];
const LAST = ['Martin', 'Diallo', 'Bernard', 'Moreau', 'Traoré', 'Lefèvre', 'Kanté', 'Garcia', 'Mendy', 'Rousseau', 'Camara'];
const POSITIONS: [string, number][] = [
  ['Goalkeeper', 1],
  ['Defender', 2], ['Defender', 4], ['Defender', 5], ['Defender', 3],
  ['Midfielder', 6], ['Midfielder', 8], ['Midfielder', 10],
  ['Attacker', 7], ['Attacker', 9], ['Attacker', 11],
  ['Attacker', 19], ['Midfielder', 14], ['Defender', 22],
];

const rand = (n: number) => Math.floor(Math.random() * n);
const delay = () => new Promise((r) => setTimeout(r, 150));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function buildMatches(): { matches: Match[]; players: Player[] } {
  const matches: Match[] = [];
  const players: Player[] = [];
  const seenTeams = new Set<string>();
  let i = 0;
  for (const competition of Object.keys(TEAMS) as Competition[]) {
    const football = COMPETITIONS[competition].sport === 'football';
    for (const [home, away] of TEAMS[competition]) {
      i++;
      const kickoff = new Date(Date.now() + (i % 5) * DAY + (2 + (i % 3) * 3) * HOUR);
      const oh = 1.3 + ((i * 37) % 30) / 10;
      matches.push({
        id: `demo-${i}`,
        competition,
        homeTeam: home,
        awayTeam: away,
        homeTeamExtId: football ? slug(home) : null,
        awayTeamExtId: football ? slug(away) : null,
        homeLogo: null,
        awayLogo: null,
        kickoff: kickoff.toISOString(),
        odds: football
          ? { home: +oh.toFixed(2), draw: +(3 + (i % 4) * 0.3).toFixed(2), away: +(8 / oh).toFixed(2) }
          : { home: +(1.4 + (i % 6) * 0.2).toFixed(2), draw: null, away: +(2.9 - (i % 6) * 0.2).toFixed(2) },
        status: 'scheduled',
        homeScore: null,
        awayScore: null,
      });
      if (football) {
        for (const team of [home, away]) {
          if (seenTeams.has(team)) continue;
          seenTeams.add(team);
          POSITIONS.forEach(([position, number], k) => {
            players.push({
              id: `${slug(team)}-${number}`,
              teamExtId: slug(team),
              name: `${FIRST[(k + team.length) % FIRST.length]} ${LAST[(k * 3 + team.length) % LAST.length]}`,
              position,
              number,
            });
          });
        }
      }
    }
  }
  return { matches, players };
}

export function createDemoBackend(): Backend {
  let me: Profile | null = null;
  const listeners = new Set<(p: Profile | null) => void>();
  const { matches, players } = buildMatches();
  const groups: Group[] = [];
  const members = new Map<string, Member[]>();
  const bets: Bet[] = [];
  let seq = 0;

  const emit = () => listeners.forEach((cb) => cb(me));
  const requireMe = () => {
    if (!me) throw new Error('Non connecté');
    return me;
  };
  const memberOf = (groupId: string) => {
    const m = members.get(groupId)?.find((x) => x.userId === requireMe().id);
    if (!m) throw new Error('Groupe introuvable');
    return m;
  };
  const addGroup = (name: string, competitions: Competition[], code?: string) => {
    const g: Group = {
      id: `g-${++seq}`,
      name,
      code: code ?? Math.random().toString(36).slice(2, 8).toUpperCase(),
      competitions,
      ownerId: requireMe().id,
      season: 1,
      status: 'active',
      winnerId: null,
    };
    groups.push(g);
    members.set(g.id, [{ userId: requireMe().id, username: requireMe().username, points: RULES.startingPoints }]);
    return g;
  };
  const seedFriends = () => {
    const g = addGroup('Les potes de Saint-Thibault', ['ligue1', 'ucl', 'nba'], 'STB777');
    members.get(g.id)!.push(
      { userId: 'f1', username: 'Karim', points: 64 },
      { userId: 'f2', username: 'Sophie', points: 48 },
      { userId: 'f3', username: 'Thomas', points: 31 },
    );
  };
  const login = (username: string) => {
    me = { id: 'me', username };
    if (!groups.length) seedFriends();
    emit();
  };

  return {
    mode: 'demo',
    async getProfile() {
      return me;
    },
    onAuthChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    async signIn(email) {
      await delay();
      login(email.split('@')[0] || 'Moi');
    },
    async signUp(_email, _password, username) {
      await delay();
      login(username || 'Moi');
    },
    async signOut() {
      me = null;
      emit();
    },
    async deleteAccount() {
      me = null;
      groups.length = 0;
      bets.length = 0;
      emit();
    },

    async listGroups() {
      await delay();
      const id = requireMe().id;
      return groups
        .filter((g) => members.get(g.id)?.some((m) => m.userId === id))
        .map((g) => ({ ...g, myPoints: memberOf(g.id).points, memberCount: members.get(g.id)!.length }));
    },
    async createGroup(name, competitions) {
      if (name.trim().length < 2) throw new Error('Nom trop court');
      if (!competitions.length) throw new Error('Choisis au moins une compétition');
      return addGroup(name.trim(), competitions);
    },
    async joinGroup(code) {
      const g = groups.find((x) => x.code === code.trim().toUpperCase());
      if (!g) throw new Error('Code inconnu (en démo, essaie STB777)');
      const list = members.get(g.id)!;
      if (!list.some((m) => m.userId === requireMe().id)) {
        list.push({ userId: requireMe().id, username: requireMe().username, points: RULES.startingPoints });
      }
      return g;
    },
    async getGroup(id) {
      await delay();
      const group = groups.find((g) => g.id === id);
      if (!group) throw new Error('Groupe introuvable');
      return { group: { ...group }, members: [...members.get(id)!].sort((a, b) => b.points - a.points) };
    },
    async restartGroup(id) {
      const g = groups.find((x) => x.id === id)!;
      if (g.ownerId !== requireMe().id) throw new Error('Seul le créateur du groupe peut relancer la partie');
      g.season++;
      g.status = 'active';
      g.winnerId = null;
      members.get(id)!.forEach((m) => (m.points = RULES.startingPoints));
    },
    async leaveGroup(id) {
      members.set(id, members.get(id)!.filter((m) => m.userId !== requireMe().id));
    },

    async listMatches(competitions) {
      await delay();
      return matches.filter((m) => competitions.includes(m.competition)).sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    },
    async getMatch(id) {
      const m = matches.find((x) => x.id === id);
      if (!m) throw new Error('Match introuvable');
      return { ...m };
    },
    async listPlayers(teamExtIds) {
      return players.filter((p) => teamExtIds.includes(p.teamExtId));
    },
    async listBets(groupId) {
      await delay();
      const g = groups.find((x) => x.id === groupId)!;
      return bets.filter((b) => b.groupId === groupId && (b as Bet & { season: number }).season === g.season);
    },
    async placeBet(groupId, matchId, req) {
      const g = groups.find((x) => x.id === groupId)!;
      if (g.status !== 'active') throw new Error('La partie est terminée');
      const m = matches.find((x) => x.id === matchId)!;
      if (m.status !== 'scheduled') throw new Error('Les paris sont fermés pour ce match');
      const mine = memberOf(groupId);
      if (bets.some((b) => b.groupId === groupId && b.matchId === matchId && b.userId === mine.userId && (b as Bet & { season: number }).season === g.season)) {
        throw new Error('Tu as déjà parié sur ce match');
      }
      const odds = m.odds[req.pick] ?? 0;
      const error = validateBet({ ...req, odds }, COMPETITIONS[m.competition].sport, mine.points);
      if (error) throw new Error(error);
      const stake = stakeFor(req);
      mine.points -= stake;
      bets.push({
        id: `b-${++seq}`,
        groupId,
        userId: mine.userId,
        matchId,
        pick: req.pick,
        odds,
        exactScore: req.exactScore,
        stake,
        status: 'pending',
        payout: null,
        winnerWon: null,
        exactWon: null,
        scorers: req.scorerIds.map((playerId) => ({ playerId, outcome: null })),
        season: g.season,
      } as Bet);
    },

    async simulateResults() {
      await delay();
      const toSettle = matches.filter((m) => m.status === 'scheduled' && bets.some((b) => b.matchId === m.id && b.status === 'pending'));
      for (const m of toSettle) {
        const football = COMPETITIONS[m.competition].sport === 'football';
        const homeScore = football ? rand(4) : 95 + rand(30);
        const awayScore = football ? rand(3) : 95 + rand(30);
        const squad = players.filter((p) => p.teamExtId === m.homeTeamExtId || p.teamExtId === m.awayTeamExtId);
        // 11 premiers numéros titulaires, les autres sur le banc
        const starters = squad.filter((p) => (p.number ?? 99) <= 11).map((p) => p.id);
        const scorers = football && homeScore + awayScore > 0 ? squad.filter(() => Math.random() < 0.12).map((p) => p.id) : [];
        Object.assign(m, { status: 'finished', homeScore, awayScore, kickoff: new Date(Date.now() - 3 * HOUR).toISOString() });
        const result = { status: 'finished' as const, homeScore, awayScore, starterIds: starters, scorerIds: scorers };
        for (const b of bets.filter((x) => x.matchId === m.id && x.status === 'pending')) {
          const s = settleBet({ pick: b.pick, odds: b.odds, exactScore: b.exactScore, scorerIds: b.scorers.map((x) => x.playerId) }, result);
          Object.assign(b, { status: 'settled', payout: s.payout, winnerWon: s.winnerWon, exactWon: s.exactWon, scorers: s.scorers });
          const member = members.get(b.groupId)?.find((x) => x.userId === b.userId);
          if (member) member.points += s.payout;
        }
      }
      // Les amis fictifs progressent aussi
      for (const g of groups) {
        for (const m of members.get(g.id)!) if (m.userId !== 'me') m.points += rand(40);
        const leader = [...members.get(g.id)!].sort((a, b) => b.points - a.points)[0];
        if (g.status === 'active' && leader.points >= RULES.targetPoints) {
          g.status = 'finished';
          g.winnerId = leader.userId;
        }
      }
      return toSettle.length;
    },
  };
}
