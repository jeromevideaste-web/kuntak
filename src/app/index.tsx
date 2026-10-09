import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Loading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors } from '@/theme';

export default function Index() {
  const { profile, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <Loading />
      </View>
    );
  }
  return <Redirect href={profile ? '/groups' : '/login'} />;
}
