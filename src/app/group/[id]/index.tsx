import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';
import { COMPETITIONS, RULES, type Competition } from '@shared/scoring';
import { betSummary, MatchCard } from '@/components/MatchCard';
import { Button, Card, Chip, ErrorText, Loading, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { backend } from '@/lib/backend';
import { errorMessage, formatKickoff } from '@/lib/format';
import type { Bet, Group, Match, Member } from '@/lib/types';
import { colors } from '@/theme';

type Tab = 'matches' | 'ranking' | 'bets';

export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>('matches');
  const [filter, setFilter] = useState<Competition | 'all'>('all');
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { group: g, members: m } = await backend.getGroup(id);
      const [ms, bs] = await Promise.all([backend.listMatches(g.competitions), backend.listBets(id)]);
      setGroup(g);
      setMembers(m);
      setMatches(ms);
      setBets(bs);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!group) {
    return (
      <Screen>
        <ErrorText message={error} />
        {!error && <Loading />}
      </Screen>
    );
  }

  const me = members.find((m) => m.userId === profile?.id);
  const myBets = bets.filter((b) => b.userId === profile?.id);
  const betFor = (matchId: string) => myBets.find((b) => b.matchId === matchId);
  const upcoming = matches.filter(
    (m) => m.status !== 'finished' && m.status !== 'cancelled' && (filter === 'all' || m.competition === filter),
  );
  const winner = members.find((m) => m.userId === group.winnerId);

  const share = () =>
    Share.share({
      message: `Rejoins mon groupe « ${group.name} » sur StbSports ! Code d'invitation : ${group.code}`,
    });

  const restart = () =>
    Alert.alert('Nouvelle partie', `Tous les joueurs repartent à ${RULES.startingPoints} points.`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Relancer',
        onPress: async () => {
          try {
            await backend.restartGroup(group.id);
            load();
          } catch (e) {
            Alert.alert('Oups', errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <Stack.Screen options={{ title: group.name }} />

      <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Muted>Mes points</Muted>
          <Text style={{ color: colors.gold, fontSize: 32, fontWeight: '900' }}>{me?.points ?? 0}</Text>
          <Muted>Objectif : {RULES.targetPoints} pts</Muted>
        </View>
        <Pressable onPress={share} style={{ alignItems: 'center', gap: 2 }}>
          <Muted>Code d'invitation</Muted>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 3 }}>{group.code}</Text>
          <Text style={{ color: colors.primary, fontWeight: '700' }}>Partager ↗</Text>
        </Pressable>
      </Card>

      {group.status === 'finished' && (
        <Card style={{ borderColor: colors.gold, alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>🏆</Text>
          <Text style={{ color: colors.gold, fontSize: 20, fontWeight: '900' }}>{winner?.username ?? '?'} a gagné la partie !</Text>
          {group.ownerId === profile?.id ? (
            <Button title="Lancer une nouvelle partie" onPress={restart} style={{ alignSelf: 'stretch' }} />
          ) : (
            <Muted>Le créateur du groupe peut lancer une nouvelle partie.</Muted>
          )}
        </Card>
      )}

      <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderRadius: 12, padding: 4 }}>
        {(
          [
            ['matches', 'Matchs'],
            ['ranking', 'Classement'],
            ['bets', 'Mes paris'],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setTab(key)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 9, backgroundColor: tab === key ? colors.cardAlt : 'transparent' }}
          >
            <Text style={{ textAlign: 'center', fontWeight: '700', color: tab === key ? colors.text : colors.muted }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <ErrorText message={error} />

      {tab === 'matches' && (
        <>
          {group.competitions.length > 1 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label="Tout" selected={filter === 'all'} onPress={() => setFilter('all')} />
              {group.competitions.map((c) => (
                <Chip key={c} label={COMPETITIONS[c].label} selected={filter === c} onPress={() => setFilter(c)} color={colors[c]} />
              ))}
            </View>
          )}
          {upcoming.length === 0 ? (
            <Card>
              <Muted>Aucun match à venir pour le moment. Les matchs de la semaine apparaissent ici dès que les cotes sont publiées.</Muted>
            </Card>
          ) : (
            upcoming.map((m) => (
              <MatchCard key={m.id} match={m} myBet={betFor(m.id)} onPress={() => router.push(`/group/${group.id}/bet/${m.id}`)} />
            ))
          )}
          {backend.simulateResults && myBets.some((b) => b.status === 'pending') && (
            <Button
              title="🎲 Démo : simuler les résultats"
              variant="secondary"
              loading={simulating}
              onPress={async () => {
                setSimulating(true);
                await backend.simulateResults!();
                await load();
                setSimulating(false);
                setTab('bets');
              }}
            />
          )}
        </>
      )}

      {tab === 'ranking' &&
        members.map((m, i) => (
          <Card key={m.userId} style={m.userId === profile?.id ? { borderColor: colors.primary } : undefined}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Text style={{ color: colors.muted, fontWeight: '900', width: 28, fontSize: 16 }}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
              </Text>
              <Text style={{ color: colors.text, fontWeight: '700', flex: 1, fontSize: 16 }}>{m.username}</Text>
              <Text style={{ color: colors.gold, fontWeight: '900', fontSize: 16 }}>{m.points} pts</Text>
            </View>
            <View style={{ height: 6, backgroundColor: colors.cardAlt, borderRadius: 3, overflow: 'hidden' }}>
              <View
                style={{
                  height: 6,
                  width: `${Math.min(100, (m.points / RULES.targetPoints) * 100)}%`,
                  backgroundColor: i === 0 ? colors.gold : colors.primary,
                }}
              />
            </View>
          </Card>
        ))}

      {tab === 'bets' &&
        (myBets.length === 0 ? (
          <Card>
            <Muted>Tu n'as pas encore parié. Va dans l'onglet Matchs !</Muted>
          </Card>
        ) : (
          [...myBets]
            .map((b) => ({ b, m: matches.find((x) => x.id === b.matchId) }))
            .sort((x, y) => (y.m?.kickoff ?? '').localeCompare(x.m?.kickoff ?? ''))
            .map(({ b, m }) => (
              <Pressable key={b.id} onPress={() => router.push(`/group/${group.id}/bet/${b.matchId}`)}>
                <Card>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>
                    {m ? `${m.homeTeam} - ${m.awayTeam}` : 'Match'}
                    {m?.status === 'finished' ? `  (${m.homeScore}-${m.awayScore})` : ''}
                  </Text>
                  {m && <Muted>{formatKickoff(m.kickoff)}</Muted>}
                  <Text style={{ color: b.status === 'pending' ? colors.gold : (b.payout ?? 0) > b.stake ? colors.primary : colors.muted, fontWeight: '800' }}>
                    {betSummary(b)}
                  </Text>
                </Card>
              </Pressable>
            ))
        ))}

      {group.ownerId !== profile?.id && (
        <Button
          variant="ghost"
          title="Quitter le groupe"
          onPress={() =>
            Alert.alert('Quitter le groupe ?', 'Tes points dans ce groupe seront perdus.', [
              { text: 'Annuler', style: 'cancel' },
              {
                text: 'Quitter',
                style: 'destructive',
                onPress: async () => {
                  await backend.leaveGroup(group.id);
                  router.back();
                },
              },
            ])
          }
        />
      )}
    </Screen>
  );
}
