import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { COMPETITIONS, RULES } from '@shared/scoring';
import { Button, Card, ErrorText, Loading, Muted, Screen, Title } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { backend } from '@/lib/backend';
import { errorMessage } from '@/lib/format';
import type { GroupSummary } from '@/lib/types';
import { colors } from '@/theme';

export default function Groups() {
  const { profile } = useAuth();
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setGroups(await backend.listGroups());
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!profile) router.replace('/login');
      else load();
    }, [profile, load]),
  );

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/account')} hitSlop={12}>
              <Text style={{ fontSize: 22 }}>👤</Text>
            </Pressable>
          ),
        }}
      />
      <Title>Salut {profile?.username} 👋</Title>
      <Muted>Le premier à {RULES.targetPoints} points remporte la partie.</Muted>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="+ Créer un groupe" onPress={() => router.push('/groups/create')} style={{ flex: 1 }} />
        <Button title="Rejoindre" variant="secondary" onPress={() => router.push('/groups/join')} style={{ flex: 1 }} />
      </View>

      <ErrorText message={error} />
      {groups === null ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Card>
          <Text style={{ color: colors.text, fontWeight: '700' }}>Aucun groupe pour l'instant</Text>
          <Muted>Crée un groupe et partage son code à tes amis, ou rejoins le leur.</Muted>
        </Card>
      ) : (
        groups.map((g) => (
          <Pressable key={g.id} onPress={() => router.push(`/group/${g.id}`)}>
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{g.name}</Text>
                <Text style={{ color: colors.gold, fontSize: 18, fontWeight: '900' }}>{g.myPoints} pts</Text>
              </View>
              <Muted>
                {g.competitions.map((c) => COMPETITIONS[c].label).join(' · ')} — {g.memberCount} joueur{g.memberCount > 1 ? 's' : ''}
              </Muted>
              {g.status === 'finished' && <Text style={{ color: colors.gold, fontWeight: '700' }}>🏆 Partie terminée</Text>}
            </Card>
          </Pressable>
        ))
      )}
    </Screen>
  );
}
