import { router } from 'expo-router';
import { Alert, Text } from 'react-native';
import { Button, Card, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { backend } from '@/lib/backend';
import { errorMessage } from '@/lib/format';
import { colors } from '@/theme';

export default function Account() {
  const { profile } = useAuth();

  const signOut = async () => {
    await backend.signOut();
    router.replace('/login');
  };

  // Obligatoire sur l'App Store : supprimer son compte depuis l'application.
  const deleteAccount = () =>
    Alert.alert('Supprimer mon compte ?', 'Ton compte, tes groupes créés et tous tes paris seront définitivement supprimés.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await backend.deleteAccount();
            router.replace('/login');
          } catch (e) {
            Alert.alert('Oups', errorMessage(e));
          }
        },
      },
    ]);

  return (
    <Screen>
      <Card>
        <Muted>Pseudo</Muted>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{profile?.username}</Text>
        {backend.mode === 'demo' && <Text style={{ color: colors.gold }}>Mode démo — les données disparaissent à la fermeture.</Text>}
      </Card>
      <Button title="📖 Règles du jeu" variant="secondary" onPress={() => router.push('/rules')} />
      <Button title="Se déconnecter" variant="secondary" onPress={signOut} />
      <Button title="Supprimer mon compte" variant="danger" onPress={deleteAccount} />
      <Muted style={{ textAlign: 'center', fontSize: 12 }}>
        StbSports — jeu gratuit entre amis, sans argent réel. Réservé aux plus de 18 ans.
      </Muted>
    </Screen>
  );
}
