import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { Button, Card, ErrorText, Field, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { backend } from '@/lib/backend';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

export default function Login() {
  const { profile } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile) router.replace('/groups');
  }, [profile]);

  const submit = async () => {
    setError(null);
    if (mode === 'signup') {
      if (username.trim().length < 2) return setError('Choisis un pseudo (2 caractères minimum).');
      if (!adult) return setError("Tu dois avoir 18 ans ou plus pour utiliser StbSports.");
    }
    if (backend.mode === 'live' && password.length < 6) return setError('Mot de passe : 6 caractères minimum.');
    setLoading(true);
    try {
      if (mode === 'signin') await backend.signIn(email, password);
      else await backend.signUp(email, password, username);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ alignItems: 'center', marginTop: 60, marginBottom: 20, gap: 6 }}>
          <Text style={{ fontSize: 44 }}>⚽🏀</Text>
          <Text style={{ color: colors.text, fontSize: 34, fontWeight: '900' }}>
            Stb<Text style={{ color: colors.primary }}>Sports</Text>
          </Text>
          <Muted style={{ textAlign: 'center' }}>Les pronos entre potes.{'\n'}Aucun argent en jeu, juste la gloire.</Muted>
        </View>

        {backend.mode === 'demo' && (
          <Card style={{ borderColor: colors.gold }}>
            <Text style={{ color: colors.gold, fontWeight: '700' }}>Mode démo</Text>
            <Muted>Saisis n'importe quel e-mail pour essayer l'application avec des matchs fictifs.</Muted>
          </Card>
        )}

        {mode === 'signup' && <Field label="Pseudo" value={username} onChangeText={setUsername} placeholder="ex. Jérôme" autoCapitalize="words" />}
        <Field label="E-mail" value={email} onChangeText={setEmail} placeholder="toi@exemple.fr" autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
        <Field label="Mot de passe" value={password} onChangeText={setPassword} secureTextEntry autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />

        {mode === 'signup' && (
          <Pressable onPress={() => setAdult(!adult)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <View
              style={{
                width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: colors.primary,
                backgroundColor: adult ? colors.primary : 'transparent', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {adult && <Text style={{ color: '#05230F', fontWeight: '900' }}>✓</Text>}
            </View>
            <Text style={{ color: colors.text, flex: 1 }}>J'ai 18 ans ou plus</Text>
          </Pressable>
        )}

        <ErrorText message={error} />
        <Button title={mode === 'signin' ? 'Se connecter' : 'Créer mon compte'} onPress={submit} loading={loading} />
        <Button
          variant="ghost"
          title={mode === 'signin' ? 'Pas encore de compte ? Inscris-toi' : "J'ai déjà un compte"}
          onPress={() => {
            setError(null);
            setMode(mode === 'signin' ? 'signup' : 'signin');
          }}
        />
        <Muted style={{ textAlign: 'center', fontSize: 12 }}>
          StbSports est un jeu gratuit entre amis. Aucun argent réel ne peut être misé ni gagné.
        </Muted>
      </Screen>
    </KeyboardAvoidingView>
  );
}
