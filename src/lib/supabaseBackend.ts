import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import type { Competition } from '@shared/scoring';
import type { Backend, Bet, Group, Match, Player, Profile } from './types';

// Lignes renvoyées par PostgREST (non typées)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any;

const toGroup = (g: Row): Group => ({
  id: g.id,
  name: g.name,
  code: g.code,
  competitions: g.competitions,
  ownerId: g.owner_id,
  season: g.season,
  status: g.status,
  winnerId: g.winner_id,
});

const toMatch = (m: Row): Match => ({
  id: m.id,
  competition: m.competition,
  homeTeam: m.home_team,
  awayTeam: m.away_team,
  homeTeamExtId: m.home_team_ext_id,
  awayTeamExtId: m.away_team_ext_id,
  homeLogo: m.home_logo,
  awayLogo: m.away_logo,
  kickoff: m.kickoff,
  odds: {
    home: m.odds_home === null ? null : Number(m.odds_home),
    draw: m.odds_draw === null ? null : Number(m.odds_draw),
    away: m.odds_away === null ? null : Number(m.odds_away),
  },
  status: m.status,
  homeScore: m.home_score,
  awayScore: m.away_score,
});

const toBet = (b: Row): Bet => ({
  id: b.id,
  groupId: b.group_id,
  userId: b.user_id,
  matchId: b.match_id,
  pick: b.pick,
  odds: Number(b.odds),
  exactScore: b.exact_home === null ? null : { home: b.exact_home, away: b.exact_away },
  stake: b.stake,
  status: b.status,
  payout: b.payout,
  winnerWon: b.winner_won,
  exactWon: b.exact_won,
  scorers: (b.bet_scorers ?? []).map((s: Row) => ({ playerId: s.player_id, outcome: s.outcome })),
});

/** Messages d'erreur PostgreSQL (raise exception) affichés tels quels. */
function check<R extends { data: unknown; error: { message: string } | null }>(res: R): NonNullable<R['data']> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<R['data']>;
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') sb.auth.startAutoRefresh();
    else sb.auth.stopAutoRefresh();
  });

  const uid = async () => {
    const { data } = await sb.auth.getSession();
    const id = data.session?.user.id;
    if (!id) throw new Error('Non connecté');
    return id;
  };

  const loadProfile = async (id: string): Promise<Profile | null> => {
    const { data } = await sb.from('profiles').select('id, username').eq('id', id).maybeSingle();
    return data ?? null;
  };

  return {
    mode: 'live',

    async getProfile() {
      const { data } = await sb.auth.getSession();
      return data.session ? loadProfile(data.session.user.id) : null;
    },

    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_event, session) => {
        // Ne pas appeler Supabase directement dans le callback (verrou interne)
        setTimeout(async () => cb(session ? await loadProfile(session.user.id) : null), 0);
      });
      return () => data.subscription.unsubscribe();
    },

    async signIn(email, password) {
      check(await sb.auth.signInWithPassword({ email: email.trim(), password }));
    },

    async signUp(email, password, username) {
      const res = check(await sb.auth.signUp({ email: email.trim(), password, options: { data: { username: username.trim() } } }));
      if (!res.session) throw new Error('Compte créé ! Confirme ton adresse e-mail puis connecte-toi.');
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async deleteAccount() {
      check(await sb.rpc('delete_account'));
      await sb.auth.signOut();
    },

    async listGroups() {
      const me = await uid();
      const rows = check(
        await sb.from('group_members').select('points, groups(*, group_members(count))').eq('user_id', me),
      ) as Row[];
      return rows.map((r) => ({
        ...toGroup(r.groups),
        myPoints: r.points,
        memberCount: r.groups.group_members?.[0]?.count ?? 1,
      }));
    },

    async createGroup(name, competitions) {
      return toGroup(check(await sb.rpc('create_group', { p_name: name, p_competitions: competitions })));
    },

    async joinGroup(code) {
      return toGroup(check(await sb.rpc('join_group', { p_code: code })));
    },

    async getGroup(id) {
      const g = check(await sb.from('groups').select('*').eq('id', id).single());
      const members = check(
        await sb.from('group_members').select('user_id, points, profiles(username)').eq('group_id', id).order('points', { ascending: false }),
      ) as Row[];
      return {
        group: toGroup(g),
        members: members.map((m) => ({ userId: m.user_id, username: m.profiles?.username ?? '?', points: m.points })),
      };
    },

    async restartGroup(id) {
      check(await sb.rpc('restart_group', { p_group: id }));
    },

    async leaveGroup(id) {
      check(await sb.rpc('leave_group', { p_group: id }));
    },

    async listMatches(competitions: Competition[]) {
      const since = new Date(Date.now() - 3 * 86_400_000).toISOString();
      const rows = check(
        await sb.from('matches').select('*').in('competition', competitions).gte('kickoff', since).order('kickoff').limit(200),
      ) as Row[];
      return rows.map(toMatch);
    },

    async getMatch(id) {
      return toMatch(check(await sb.from('matches').select('*').eq('id', id).single()));
    },

    async listPlayers(teamExtIds) {
      if (!teamExtIds.length) return [];
      const rows = check(await sb.from('players').select('*').in('team_ext_id', teamExtIds).order('name')) as Row[];
      return rows.map(
        (p): Player => ({ id: p.id, teamExtId: p.team_ext_id, name: p.name, position: p.position, number: p.number }),
      );
    },

    async listBets(groupId) {
      const g = check(await sb.from('groups').select('season').eq('id', groupId).single()) as Row;
      const rows = check(
        await sb.from('bets').select('*, bet_scorers(player_id, outcome)').eq('group_id', groupId).eq('season', g.season),
      ) as Row[];
      return rows.map(toBet);
    },

    async placeBet(groupId, matchId, bet) {
      check(
        await sb.rpc('place_bet', {
          p_group: groupId,
          p_match: matchId,
          p_pick: bet.pick,
          p_exact_home: bet.exactScore?.home ?? null,
          p_exact_away: bet.exactScore?.away ?? null,
          p_scorers: bet.scorerIds,
        }),
      );
    },
  };
}
