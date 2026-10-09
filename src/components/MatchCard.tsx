import { Pressable, StyleSheet, Text, View } from 'react-native';
import { COMPETITIONS } from '@shared/scoring';
import { formatKickoff, formatOdds } from '@/lib/format';
import type { Bet, Match } from '@/lib/types';
import { colors, radius } from '@/theme';

const PICK_LABEL = { home: '1', draw: 'N', away: '2' } as const;

export function CompetitionBadge({ competition }: { competition: Match['competition'] }) {
  return (
    <View style={[s.badge, { backgroundColor: colors[competition] }]}>
      <Text style={s.badgeText}>{COMPETITIONS[competition].short}</Text>
    </View>
  );
}

export function MatchCard({ match, myBet, onPress }: { match: Match; myBet?: Bet; onPress: () => void }) {
  const finished = match.status === 'finished';
  const open = match.status === 'scheduled' && Date.parse(match.kickoff) > Date.now();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={s.row}>
        <CompetitionBadge competition={match.competition} />
        <Text style={s.date}>{formatKickoff(match.kickoff)}</Text>
        {match.status === 'cancelled' && <Text style={[s.tag, { color: colors.danger }]}>Annulé</Text>}
        {match.status === 'live' && <Text style={[s.tag, { color: colors.primary }]}>En cours</Text>}
      </View>

      <View style={s.teams}>
        <Text style={s.team} numberOfLines={1}>{match.homeTeam}</Text>
        <Text style={s.score}>{finished ? `${match.homeScore} - ${match.awayScore}` : 'vs'}</Text>
        <Text style={[s.team, { textAlign: 'right' }]} numberOfLines={1}>{match.awayTeam}</Text>
      </View>

      <View style={s.odds}>
        {(['home', 'draw', 'away'] as const).map((k) =>
          k === 'draw' && match.odds.draw === null ? null : (
            <View key={k} style={[s.odd, myBet?.pick === k && { borderColor: colors.primary, backgroundColor: '#123322' }]}>
              <Text style={s.oddLabel}>{PICK_LABEL[k]}</Text>
              <Text style={s.oddValue}>{formatOdds(myBet?.pick === k ? myBet.odds : match.odds[k])}</Text>
            </View>
          ),
        )}
      </View>

      <Text style={[s.footer, myBet ? { color: betColor(myBet) } : open ? { color: colors.primary } : null]}>
        {myBet ? betSummary(myBet) : open ? 'Parier →' : 'Paris fermés'}
      </Text>
    </Pressable>
  );
}

function betColor(b: Bet) {
  if (b.status === 'pending') return colors.gold;
  if (b.status === 'void') return colors.muted;
  return (b.payout ?? 0) > 0 ? colors.primary : colors.danger;
}

export function betSummary(b: Bet): string {
  if (b.status === 'pending') return `Pari en cours${b.stake ? ` · ${b.stake} pts engagés` : ''}`;
  if (b.status === 'void') return 'Match annulé · mises rendues';
  const net = (b.payout ?? 0) - b.stake;
  return `${net >= 0 ? '+' : ''}${net} pts`;
}

const s = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius, padding: 14, gap: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  date: { color: colors.muted, fontSize: 13, flex: 1 },
  tag: { fontWeight: '700', fontSize: 12 },
  teams: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  team: { color: colors.text, fontSize: 16, fontWeight: '700', flex: 1 },
  score: { color: colors.text, fontSize: 18, fontWeight: '800', minWidth: 50, textAlign: 'center' },
  odds: { flexDirection: 'row', gap: 8 },
  odd: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  oddLabel: { color: colors.muted, fontWeight: '700' },
  oddValue: { color: colors.text, fontWeight: '800' },
  footer: { color: colors.muted, fontWeight: '700', fontSize: 13 },
});
