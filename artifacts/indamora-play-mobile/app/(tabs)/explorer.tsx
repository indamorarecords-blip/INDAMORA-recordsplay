import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useGetCatalog } from '@workspace/api-client-react';
import { AppHeader, EmptyState, ErrorState } from '@/components/Brand';
import { WorkCard } from '@/components/Cards';
import { useColors } from '@/hooks/useColors';

const filters = ['Tout', 'Musique', 'Humour', 'Cinéma', 'Podcasts'];

export default function ExplorerScreen() {
  const colors = useColors();
  const router = useRouter();
  const catalog = useGetCatalog();
  const [filter, setFilter] = useState('Tout');
  const data = catalog.data?.filter((work) => filter === 'Tout' || work.category.toLowerCase().includes(filter.toLowerCase())) ?? [];
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <AppHeader eyebrow="Catalogue" title="Explorer" action={<Pressable onPress={() => void catalog.refetch()} style={({ pressed }) => [styles.refresh, pressed && { opacity: 0.6 }]}><Ionicons name="refresh" size={19} color={colors.primary} /></Pressable>} />
      <View style={styles.filterWrap}><FlatList horizontal data={filters} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} keyExtractor={(item) => item} renderItem={({ item }) => <Pressable onPress={() => setFilter(item)} style={[styles.filter, { backgroundColor: filter === item ? colors.primary : colors.card, borderColor: filter === item ? colors.primary : colors.border }]}><Text style={[styles.filterText, { color: filter === item ? colors.primaryForeground : colors.mutedForeground }]}>{item}</Text></Pressable>} /></View>
      {catalog.isLoading && <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>}
      {catalog.error && <ErrorState onRetry={() => void catalog.refetch()} />}
      {!catalog.isLoading && !catalog.error && data.length === 0 && <EmptyState icon="musical-notes-outline" title="Aucune œuvre ici" text="Les nouvelles créations apparaîtront dans cette sélection." />}
      {!catalog.isLoading && !catalog.error && data.length > 0 && <FlatList data={data} numColumns={2} columnWrapperStyle={styles.columns} contentContainerStyle={styles.list} keyExtractor={(item) => String(item.id)} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={catalog.isRefetching} onRefresh={() => void catalog.refetch()} tintColor={colors.primary} />} renderItem={({ item }) => <WorkCard work={item} onPress={() => router.push(`/work/${item.id}`)} />} />}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  refresh: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  filterWrap: { paddingHorizontal: 20, paddingBottom: 10 },
  filters: { gap: 8, paddingRight: 20 },
  filter: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  filterText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120, gap: 22 },
  columns: { justifyContent: 'space-between' },
});