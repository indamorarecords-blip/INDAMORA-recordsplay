import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGetArtists, useGetCatalog } from '@workspace/api-client-react';
import { AppHeader, ErrorState, Screen } from '@/components/Brand';
import { ArtistCard, SectionTitle, WorkCard } from '@/components/Cards';
import { useColors } from '@/hooks/useColors';
import { resolveMediaUrl } from '@/lib/media';

export default function HomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const catalog = useGetCatalog();
  const artists = useGetArtists();
  const featured = catalog.data?.filter((work) => work.featured) ?? catalog.data?.slice(0, 4) ?? [];
  const directory = artists.data?.slice(0, 3) ?? [];
  const loading = catalog.isLoading || artists.isLoading;
  const error = catalog.error ?? artists.error;
  return (
    <Screen scroll>
      <AppHeader action={<Pressable onPress={() => router.push('/profile')} style={({ pressed }) => [styles.profileButton, { backgroundColor: colors.card }, pressed && { opacity: 0.7 }]}><Ionicons name="person-outline" size={19} color={colors.foreground} /></Pressable>} />
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={styles.heroScroller} contentContainerStyle={styles.heroContent}>
        <ImageBackground source={featured[0] ? { uri: resolveMediaUrl(featured[0].coverObjectPath) ?? resolveMediaUrl(featured[0].image) } : undefined} imageStyle={styles.heroImage} style={[styles.hero, { backgroundColor: colors.secondary }]}>
          <View style={styles.heroOverlay} />
          <View style={styles.heroCopy}><Text style={styles.heroEyebrow}>LE FOYER CULTUREL</Text><Text style={styles.heroTitle}>Notre musique.{'\n'}Notre culture.{'\n'}Notre scène.</Text><Pressable onPress={() => router.push('/explorer')} style={({ pressed }) => [styles.heroButton, { backgroundColor: colors.accent }, pressed && { opacity: 0.78 }]}><Text style={[styles.heroButtonText, { color: colors.accentForeground }]}>Explorer le catalogue</Text><Ionicons name="arrow-forward" size={16} color={colors.accentForeground} /></Pressable></View>
        </ImageBackground>
        <View style={[styles.hero, styles.heroSecond, { backgroundColor: colors.primary }]}><Ionicons name="radio" size={46} color={colors.primaryForeground} /><Text style={[styles.heroEyebrow, { color: colors.primaryForeground, marginTop: 20 }]}>INDAMORA RECORDS</Text><Text style={[styles.heroTitle, { color: colors.primaryForeground }]}>Les voix qui font vibrer l’Afrique centrale.</Text><Text style={[styles.heroSub, { color: colors.primaryForeground }]}>Découvrez les talents, soutenez les créations, partagez la scène.</Text></View>
      </ScrollView>
      {loading && <View style={styles.loading}><ActivityIndicator color={colors.primary} /></View>}
      {error && <ErrorState onRetry={() => { void catalog.refetch(); void artists.refetch(); }} />}
      {!loading && !error && <><SectionTitle title="À découvrir" action="Tout voir" onAction={() => router.push('/explorer')} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>{featured.map((work) => <WorkCard key={work.id} work={work} onPress={() => router.push(`/work/${work.id}`)} />)}</ScrollView><SectionTitle title="Le Répertoire" action="Voir tout" onAction={() => router.push('/repertoire')} />{directory.map((artist) => <ArtistCard key={artist.id} artist={artist} onPress={() => router.push(`/artist/${artist.id}`)} />)}</>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  heroScroller: { marginHorizontal: -20 },
  heroContent: { paddingHorizontal: 20, gap: 12 },
  hero: { width: 335, height: 390, borderRadius: 26, overflow: 'hidden', justifyContent: 'flex-end' },
  heroSecond: { padding: 26, justifyContent: 'center' },
  heroImage: { borderRadius: 26 },
  heroOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(21, 16, 12, .52)' },
  heroCopy: { padding: 26 },
  heroEyebrow: { color: '#FFF9EF', fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.8 },
  heroTitle: { color: '#FFF9EF', fontFamily: 'Inter_700Bold', fontSize: 31, lineHeight: 34, letterSpacing: -1.1, marginTop: 12 },
  heroSub: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 22, marginTop: 18, opacity: 0.88 },
  heroButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13, marginTop: 22 },
  heroButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  loading: { paddingVertical: 40 },
  row: { paddingRight: 10 },
});