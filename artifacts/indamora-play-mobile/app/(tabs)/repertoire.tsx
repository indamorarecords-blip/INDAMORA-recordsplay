import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useGetArtists } from '@workspace/api-client-react';
import { AppHeader, EmptyState, ErrorState } from '@/components/Brand';
import { ArtistCard } from '@/components/Cards';
import { useColors } from '@/hooks/useColors';

export default function DirectoryScreen() {
  const colors = useColors();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const artists = useGetArtists({ search: search.trim() || undefined });
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader eyebrow="Talents & professionnels" title="Le Répertoire" />
      <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}><Ionicons name="search" size={18} color={colors.mutedForeground} /><TextInput testID="input-search-directory" value={search} onChangeText={setSearch} placeholder="Rechercher un nom, une ville…" placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground }]} autoCapitalize="none" /></View>
      {artists.isLoading && <View style={styles.center}><Text style={[styles.helper, { color: colors.mutedForeground }]}>Chargement du Répertoire…</Text></View>}
      {artists.error && <ErrorState onRetry={() => void artists.refetch()} />}
      {!artists.isLoading && !artists.error && artists.data?.length === 0 && <EmptyState icon="people-outline" title="Aucun profil trouvé" text="Essayez un autre nom, une autre ville ou revenez plus tard." />}
      {!artists.isLoading && !artists.error && (artists.data?.length ?? 0) > 0 && <FlatList data={artists.data} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <ArtistCard artist={item} onPress={() => router.push(`/artist/${item.id}`)} />} contentContainerStyle={styles.list} showsVerticalScrollIndicator={false} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  searchBox: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, paddingHorizontal: 14, height: 50 },
  input: { flex: 1, fontFamily: 'Inter_400Regular', fontSize: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  helper: { fontFamily: 'Inter_400Regular', fontSize: 14 },
  list: { padding: 20, paddingBottom: 120 },
});