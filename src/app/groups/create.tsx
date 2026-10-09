import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { COMPETITIONS, type Competition } from '@shared/scoring';
import { Button, Chip, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { backend } from '@/lib/backend';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

export default function CreateGroup() {
  const [name, setName] = useState('');
  const [competitions, setCompetitions] = useState<Competition[]>(['ligue1']);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = (c: Competition) =>
    setCompetitions((list) => (list.includes(c) ? list.filter((x) => x !== c) : [...list, c]));

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError('Donne un nom à ton groupe.');
    if (!competitions.length) return setError('Choisis au moins une compétition.');
    setLoading(true);
    try {
      const g = await backend.createGroup(name, competitions);
      router.dismiss();
      router.push(`/group/${g.id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <Field label="Nom du groupe" value={name} onChangeText={setName} placeholder="ex. Les potes du foot" maxLength={40} />
      <Muted>Compétitions sur lesquelles on parie :</Muted>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(COMPETITIONS) as Competition[]).map((c) => (
          <Chip key={c} label={COMPETITIONS[c].label} selected={competitions.includes(c)} onPress={() => toggle(c)} color={colors[c]} />
        ))}
      </View>
      <ErrorText message={error} />
      <Button title="Créer le groupe" onPress={submit} loading={loading} />
      <Muted>Tu recevras un code à partager à tes amis pour qu'ils te rejoignent.</Muted>
    </Screen>
  );
}
