// Accès aux fournisseurs de données sportives.
// Football (Ligue 1, Ligue des Champions) : API-Football — https://www.api-football.com
// NBA : The Odds API — https://the-odds-api.com
import type { Competition } from './scoring.ts';

const API_FOOTBALL = 'https://v3.football.api-sports.io';
const ODDS_API = 'https://api.the-odds-api.com/v4';

export const FOOTBALL_LEAGUES: Partial<Record<Competition, number>> = { ligue1: 61, ucl: 2 };

export interface MatchRow {
  id: string;
  competition: Competition;
  home_team: string;
  away_team: string;
  home_team_ext_id: string | null;
  away_team_ext_id: string | null;
  home_logo: string | null;
  away_logo: string | null;
  kickoff: string;
  odds_home: number | null;
  odds_draw: number | null;
  odds_away: number | null;
  status: 'scheduled' | 'live' | 'finished' | 'cancelled';
  home_score: number | null;
  away_score: number | null;
}

export interface PlayerRow {
  id: string;
  team_ext_id: string;
  name: string;
  position: string | null;
  number: number | null;
}

export interface FootballResult {
  status: MatchRow['status'];
  homeScore: number | null;
  awayScore: number | null;
  starterIds: string[];
  scorerIds: string[];
}

function env(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Variable d'environnement manquante : ${name}`);
  return v;
}

/** Saison au sens API-Football : 2026 pour la saison 2026-2027. */
export function footballSeason(d = new Date()): number {
  return d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
}

/** Médiane : la cote « du marché », peu sensible à un bookmaker atypique. */
export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 1).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return Math.round(m * 100) / 100;
}

// deno-lint-ignore no-explicit-any
async function apiFootball(path: string, params: Record<string, string | number>): Promise<any> {
  const url = new URL(API_FOOTBALL + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-apisports-key': env('API_FOOTBALL_KEY') } });
  if (!res.ok) throw new Error(`API-Football ${path} : HTTP ${res.status}`);
  const json = await res.json();
  const errors = json.errors && (Array.isArray(json.errors) ? json.errors : Object.values(json.errors));
  if (errors?.length) throw new Error(`API-Football ${path} : ${JSON.stringify(json.errors)}`);
  return json;
}

function footballStatus(short: string): MatchRow['status'] {
  if (['FT', 'AET', 'PEN'].includes(short)) return 'finished';
  if (['PST', 'CANC', 'ABD', 'AWD', 'WO'].includes(short)) return 'cancelled';
  if (['TBD', 'NS'].includes(short)) return 'scheduled';
  return 'live';
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** Matchs des prochains jours avec leurs cotes 1N2. */
export async function fetchFootballMatches(competition: Competition, days: number): Promise<MatchRow[]> {
  const league = FOOTBALL_LEAGUES[competition]!;
  const season = footballSeason();
  const from = new Date();
  const to = new Date(Date.now() + days * 86_400_000);
  const fixtures = await apiFootball('/fixtures', { league, season, from: isoDate(from), to: isoDate(to), timezone: 'UTC' });

  // Cotes « Match Winner » (bet=1) de tous les bookmakers, paginées
  const odds = new Map<number, { home: number[]; draw: number[]; away: number[] }>();
  for (let page = 1, total = 1; page <= total && page <= 10; page++) {
    const json = await apiFootball('/odds', { league, season, bet: 1, page });
    total = json.paging?.total ?? 1;
    for (const item of json.response) {
      const acc = { home: [] as number[], draw: [] as number[], away: [] as number[] };
      for (const bk of item.bookmakers ?? []) {
        for (const bet of bk.bets ?? []) {
          for (const v of bet.values ?? []) {
            const key = ({ Home: 'home', Draw: 'draw', Away: 'away' } as const)[v.value as 'Home' | 'Draw' | 'Away'];
            if (key) acc[key].push(parseFloat(v.odd));
          }
        }
      }
      odds.set(item.fixture.id, acc);
    }
  }

  // deno-lint-ignore no-explicit-any
  return fixtures.response.map((f: any): MatchRow => {
    const o = odds.get(f.fixture.id);
    return {
      id: `fb-${f.fixture.id}`,
      competition,
      home_team: f.teams.home.name,
      away_team: f.teams.away.name,
      home_team_ext_id: String(f.teams.home.id),
      away_team_ext_id: String(f.teams.away.id),
      home_logo: f.teams.home.logo ?? null,
      away_logo: f.teams.away.logo ?? null,
      kickoff: f.fixture.date,
      odds_home: o ? median(o.home) : null,
      odds_draw: o ? median(o.draw) : null,
      odds_away: o ? median(o.away) : null,
      status: footballStatus(f.fixture.status.short),
      home_score: f.score?.fulltime?.home ?? null,
      away_score: f.score?.fulltime?.away ?? null,
    };
  });
}

export async function fetchSquad(teamExtId: string): Promise<PlayerRow[]> {
  const json = await apiFootball('/players/squads', { team: teamExtId });
  const squad = json.response?.[0]?.players ?? [];
  // deno-lint-ignore no-explicit-any
  return squad.map((p: any) => ({
    id: String(p.id),
    team_ext_id: teamExtId,
    name: p.name,
    position: p.position ?? null,
    number: p.number ?? null,
  }));
}

/**
 * Résultat d'un match de football : score à la fin du temps réglementaire,
 * titulaires et buteurs (hors contre-son-camp et hors prolongation).
 */
export async function fetchFootballResults(fixtureIds: string[]): Promise<Map<string, FootballResult>> {
  const out = new Map<string, FootballResult>();
  for (let i = 0; i < fixtureIds.length; i += 20) {
    const ids = fixtureIds.slice(i, i + 20).join('-');
    const json = await apiFootball('/fixtures', { ids });
    for (const f of json.response) {
      const starterIds: string[] = [];
      for (const lineup of f.lineups ?? []) {
        for (const s of lineup.startXI ?? []) if (s.player?.id) starterIds.push(String(s.player.id));
      }
      const scorerIds = new Set<string>();
      for (const e of f.events ?? []) {
        if (e.type === 'Goal' && e.detail !== 'Own Goal' && e.detail !== 'Missed Penalty' && e.time?.elapsed <= 90 && e.player?.id) {
          scorerIds.add(String(e.player.id));
        }
      }
      out.set(`fb-${f.fixture.id}`, {
        status: footballStatus(f.fixture.status.short),
        homeScore: f.score?.fulltime?.home ?? f.goals?.home ?? null,
        awayScore: f.score?.fulltime?.away ?? f.goals?.away ?? null,
        starterIds,
        scorerIds: [...scorerIds],
      });
    }
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function oddsApi(path: string, params: Record<string, string>): Promise<any> {
  const url = new URL(ODDS_API + path);
  url.searchParams.set('apiKey', env('ODDS_API_KEY'));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The Odds API ${path} : HTTP ${res.status} ${await res.text()}`);
  return res.json();
}

/** Matchs NBA à venir avec la cote médiane des bookmakers européens. */
export async function fetchNbaMatches(): Promise<MatchRow[]> {
  const events = await oddsApi('/sports/basketball_nba/odds', { regions: 'eu', markets: 'h2h', oddsFormat: 'decimal' });
  // deno-lint-ignore no-explicit-any
  return events.map((e: any): MatchRow => {
    const home: number[] = [];
    const away: number[] = [];
    for (const bk of e.bookmakers ?? []) {
      for (const m of bk.markets ?? []) {
        if (m.key !== 'h2h') continue;
        for (const o of m.outcomes ?? []) {
          if (o.name === e.home_team) home.push(o.price);
          else if (o.name === e.away_team) away.push(o.price);
        }
      }
    }
    return {
      id: `nba-${e.id}`,
      competition: 'nba',
      home_team: e.home_team,
      away_team: e.away_team,
      home_team_ext_id: null,
      away_team_ext_id: null,
      home_logo: null,
      away_logo: null,
      kickoff: e.commence_time,
      odds_home: median(home),
      odds_draw: null,
      odds_away: median(away),
      status: 'scheduled',
      home_score: null,
      away_score: null,
    };
  });
}

/** Scores NBA des 3 derniers jours (prolongations comprises). */
export async function fetchNbaScores(): Promise<Map<string, { completed: boolean; home: number | null; away: number | null }>> {
  const events = await oddsApi('/sports/basketball_nba/scores', { daysFrom: '3' });
  const out = new Map<string, { completed: boolean; home: number | null; away: number | null }>();
  for (const e of events) {
    // deno-lint-ignore no-explicit-any
    const score = (team: string) => {
      const s = (e.scores ?? []).find((x: any) => x.name === team);
      return s ? parseInt(s.score, 10) : null;
    };
    out.set(`nba-${e.id}`, { completed: !!e.completed, home: score(e.home_team), away: score(e.away_team) });
  }
  return out;
}
