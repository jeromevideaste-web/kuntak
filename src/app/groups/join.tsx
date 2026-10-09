import { router } from 'expo-router';
import { useState } from 'react';
import { Button, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { backend } from '@/lib/backend';
import { errorMessage } from '@/lib/format';

export default function JoinGroup() {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      const g = await backend.joinGroup(code);
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
      <Field
        label="Code d'invitation"
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="ex. K7P2QX"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={8}
        style={{ fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: '800', color: '#fff', backgroundColor: '#141C2F', borderRadius: 14, padding: 14 }}
      />
      <ErrorText message={error} />
      <Button title="Rejoindre" onPress={submit} loading={loading} disabled={code.trim().length < 4} />
      <Muted>Demande le code au créateur du groupe. Tu démarres avec 20 points.</Muted>
    </Screen>
  );
}
