import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '@/lib/auth';
import { colors } from '@/theme';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '800' },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="groups/index" options={{ title: 'StbSports' }} />
        <Stack.Screen name="groups/create" options={{ title: 'Nouveau groupe', presentation: 'modal' }} />
        <Stack.Screen name="groups/join" options={{ title: 'Rejoindre un groupe', presentation: 'modal' }} />
        <Stack.Screen name="group/[id]/index" options={{ title: '' }} />
        <Stack.Screen name="group/[id]/bet/[matchId]" options={{ title: 'Mon pari' }} />
        <Stack.Screen name="account" options={{ title: 'Mon compte' }} />
        <Stack.Screen name="rules" options={{ title: 'Règles du jeu' }} />
      </Stack>
    </AuthProvider>
  );
}
