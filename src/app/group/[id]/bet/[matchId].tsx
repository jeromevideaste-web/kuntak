import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COMPETITIONS, maxPayout, RULES, stakeFor, validateBet, winnerGain, type BetPick } from '@shared/scoring';
import { CompetitionBadge } from '@/components/MatchCard';
import { Button, Card, Chip, ErrorText, Loading, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { backend } from '@/lib/backend';
import { errorMessage, formatKickoff, formatOdds } from '@/lib/format';
import type { Bet, Match, Member, Player } from '@/lib/types';
import { colors } from '@/theme';

const POSITION_ORDER: Record<string, number> = { Attacker: 0, Midfielder: 1, Defender: 2, Goalkeeper: 3 };
const OUTCOME_LABEL = { won: '✅ +30', lost: '❌', refunded: '↩︎ remboursé (non titulaire)' } as const;

export default function BetScreen() {
  const { id: groupId, matchId } = useLocalSearchParams<{ id: string; matchId: string }>();
  const { profile } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [pick, setPick] = useState<BetPick | null>(null);
  const [exactOn, setExactOn] = useState(false);
  const [exact, setExact] = useState({ home: 1, away: 0 });
  const [scorerIds, setScorerIds] = useState<string[]>([]);
  const [team, setTeam] = useState<'home' | 'away'>('home');

  useEffect(() => {
    (async () => {
      try {
        const m = await backend.getMatch(matchId);
        const [g, bs, ps] = await Promise.all([
          backend.getGroup(groupId),
          backend.listBets(groupId),
          backend.listPlayers([m.homeTeamExtId, m.awayTeamExtId].filter(Boolean) as string[]),
        ]);
        setMatch(m);
        setMembers(g.members);
        setBets(bs.filter((b) => b.matchId === matchId));
        setPlayers(ps);
      } catch (e) {
        setError(errorMessage(e));
      }
    })();
  }, [groupId, matchId]);

  const playerName = useMemo(() => new Map(players.map((p) => [p.id, p.name])), [players]);

  if (!match) {
    return (
      <Screen>
        <ErrorText message={error} />
        {!error && <Loading />}
      </Screen>
    );
  }

  const sport = COMPETITIONS[match.competition].sport;
  const football = sport === 'football';
  const open = match.status === 'scheduled' && Date.parse(match.kickoff) > Date.now();
  const balance = members.find((m) => m.userId === profile?.id)?.points ?? 0;
  const myBet = bets.find((b) => b.userId === profile?.id);
  const friendBets = bets.filter((b) => b.userId !== profile?.id);

  const draft = {
    pick: pick ?? 'home',
    odds: pick ? match.odds[pick] ?? 0 : 0,
    exactScore: exactOn ? exact : null,
    scorerIds,
  };
  const stake = stakeFor(draft);
  const validation = pick ? validateBet(draft, sport, balance) : 'Choisis le vainqueur du match.';

  const submit = async () => {
    if (!pick || validation) return setError(validation);
    setSaving(true);
    setError(null);
    try {
      await backend.placeBet(groupId, matchId, { pick, exactScore: draft.exactScore, scorerIds });
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleScorer = (playerId: string) =>
    setScorerIds((list) =>
      list.includes(playerId) ? list.filter((x) => x !== playerId) : list.length >= RULES.maxScorers ? list : [...list, playerId],
    );

  const teamExtId = team === 'home' ? match.homeTeamExtId : match.awayTeamExtId;
  const squad = players
    .filter((p) => p.teamExtId === teamExtId)
    .sort((a, b) => (POSITION_ORDER[a.position ?? ''] ?? 9) - (POSITION_ORDER[b.position ?? ''] ?? 9) || a.name.localeCompare(b.name));

  const pickLabel = (k: BetPick) => (k === 'home' ? match.homeTeam : k === 'away' ? match.awayTeam : 'Match nul');
  const username = (userId: string) => members.find((m) => m.userId === userId)?.username ?? '?';

  return (
    <Screen>
      <Card style={{ alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <CompetitionBadge competition={match.competition} />
          <Muted>{formatKickoff(match.kickoff)}</Muted>
        </View>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '900', textAlign: 'center' }}>
          {match.homeTeam} {match.status === 'finished' ? `${match.homeScore} - ${match.awayScore}` : 'vs'} {match.awayTeam}
        </Text>
      </Card>

      {myBet ? (
        <Card style={{ borderColor: colors.primary }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Mon pari</Text>
          <BetLines bet={myBet} pickLabel={pickLabel} playerName={playerName} />
        </Card>
      ) : !open ? (
        <Card>
          <Muted>Les paris sont fermés pour ce match.</Muted>
        </Card>
      ) : (
        <>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>1. Qui gagne ?</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['home', 'draw', 'away'] as const).map((k) => {
              const odds = match.odds[k];
              if (k === 'draw' && !football) return null;
              const selected = pick === k;
              return (
                <Pressable
                  key={k}
                  disabled={odds === null}
                  onPress={() => setPick(k)}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    gap: 4,
                    alignItems: 'center',
                    backgroundColor: selected ? '#123322' : colors.card,
                    borderWidth: 2,
                    borderColor: selected ? colors.primary : colors.border,
                    opacity: odds === null ? 0.4 : 1,
                  }}
                >
                  <Text style={{ color: colors.text, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>
                    {pickLabel(k)}
                  </Text>
                  <Text style={{ color: colors.gold, fontWeight: '900', fontSize: 18 }}>{formatOdds(odds)}</Text>
                  <Muted style={{ fontSize: 12 }}>{odds ? `+${winnerGain(odds)} pts` : '—'}</Muted>
                </Pressable>
              );
            })}
          </View>

          {football ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16, flex: 1 }}>2. Bonus score exact</Text>
                <Chip label={exactOn ? `Oui · ${RULES.exactScoreStake} pts` : 'Non'} selected={exactOn} onPress={() => setExactOn(!exactOn)} />
              </View>
              {exactOn && (
                <Card style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
                  <Stepper label={match.homeTeam} value={exact.home} onChange={(home) => setExact({ ...exact, home })} />
                  <Text style={{ color: colors.muted, fontSize: 24, fontWeight: '900' }}>-</Text>
                  <Stepper label={match.awayTeam} value={exact.away} onChange={(away) => setExact({ ...exact, away })} />
                </Card>
              )}
              <Muted>Score trouvé : mise rendue + {RULES.exactScoreBonus} pts (score à la fin du temps réglementaire).</Muted>

              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                3. Bonus buteurs ({scorerIds.length}/{RULES.maxScorers}) · {RULES.scorerStake} pts chacun
              </Text>
              <Muted>
                Buteur trouvé : mise rendue + {RULES.scorerBonus} pts. Joueur absent ou remplaçant : mise remboursée.
              </Muted>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Chip label={match.homeTeam} selected={team === 'home'} onPress={() => setTeam('home')} />
                <Chip label={match.awayTeam} selected={team === 'away'} onPress={() => setTeam('away')} />
              </View>
              {squad.length === 0 ? (
                <Muted>L'effectif de cette équipe n'est pas encore disponible.</Muted>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {squad.map((p) => (
                    <Chip
                      key={p.id}
                      label={`${p.number ? `${p.number} · ` : ''}${p.name}`}
                      selected={scorerIds.includes(p.id)}
                      onPress={() => toggleScorer(p.id)}
                    />
                  ))}
                </View>
              )}
            </>
          ) : (
            <Muted>En NBA, seul le pari sur le vainqueur est disponible (prolongations comprises).</Muted>
          )}

          <Card>
            <Row label="Mon solde" value={`${balance} pts`} />
            <Row label="Points engagés maintenant" value={`${stake} pts`} />
            <Row label="Gain maximum" value={pick ? `${maxPayout(draft)} pts` : '—'} highlight />
          </Card>
          <ErrorText message={error ?? (pick && validation ? validation : null)} />
          <Button title="Valider mon pari" onPress={submit} loading={saving} disabled={!!validation} />
          <Muted style={{ textAlign: 'center', fontSize: 12 }}>Un pari validé ne peut plus être modifié.</Muted>
        </>
      )}

      {friendBets.length > 0 && (
        <>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>Les paris des amis</Text>
          {friendBets.map((b) => (
            <Card key={b.id}>
              <Text style={{ color: colors.text, fontWeight: '800' }}>{username(b.userId)}</Text>
              <BetLines bet={b} pickLabel={pickLabel} playerName={playerName} />
            </Card>
          ))}
        </>
      )}
      {open && <Muted style={{ textAlign: 'center' }}>Les paris des amis sont dévoilés au coup d'envoi 🤫</Muted>}
    </Screen>
  );
}

function BetLines({
  bet,
  pickLabel,
  playerName,
}: {
  bet: Bet;
  pickLabel: (k: BetPick) => string;
  playerName: Map<string, string>;
}) {
  const mark = (won: boolean | null) => (bet.status !== 'settled' || won === null ? '' : won ? ' ✅' : ' ❌');
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.text }}>
        Vainqueur : {pickLabel(bet.pick)} @ {formatOdds(bet.odds)}
        {mark(bet.winnerWon)}
      </Text>
      {bet.exactScore && (
        <Text style={{ color: colors.text }}>
          Score exact : {bet.exactScore.home} - {bet.exactScore.away}
          {mark(bet.exactWon)}
        </Text>
      )}
      {bet.scorers.map((s) => (
        <Text key={s.playerId} style={{ color: colors.text }}>
          Buteur : {playerName.get(s.playerId) ?? s.playerId} {s.outcome ? OUTCOME_LABEL[s.outcome] : ''}
        </Text>
      ))}
      <Text style={{ color: colors.gold, fontWeight: '800' }}>
        {bet.status === 'pending'
          ? `En attente · ${bet.stake} pts engagés`
          : bet.status === 'void'
            ? 'Match annulé · mises rendues'
            : `Résultat : ${(bet.payout ?? 0) - bet.stake >= 0 ? '+' : ''}${(bet.payout ?? 0) - bet.stake} pts`}
      </Text>
    </View>
  );
}

function Stepper({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const btn = (text: string, next: number) => (
    <Pressable
      onPress={() => onChange(Math.max(0, Math.min(20, next)))}
      hitSlop={8}
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>{text}</Text>
    </Pressable>
  );
  return (
    <View style={{ alignItems: 'center', gap: 6, flex: 1 }}>
      <Muted style={{ fontSize: 12 }}>{label}</Muted>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {btn('−', value - 1)}
        <Text style={{ color: colors.text, fontSize: 28, fontWeight: '900', minWidth: 30, textAlign: 'center' }}>{value}</Text>
        {btn('+', value + 1)}
      </View>
    </View>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <Muted>{label}</Muted>
      <Text style={{ color: highlight ? colors.primary : colors.text, fontWeight: '800' }}>{value}</Text>
    </View>
  );
}
