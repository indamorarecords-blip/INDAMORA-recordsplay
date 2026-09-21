import { Ionicons } from '@expo/vector-icons';
import { getGetArtistQueryKey, useGetArtist } from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackButton, ErrorState } from '@/components/Brand';
import { useColors } from '@/hooks/useColors';
import { categoryLabel, resolveMediaUrl } from '@/lib/media';

export default function ArtistDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const artistId = Number(id);
  const artist = useGetArtist(artistId, { query: { enabled: Number.isFinite(artistId), queryKey: getGetArtistQueryKey(artistId) } });
  const avatar = resolveMediaUrl(artist.data?.avatar);
  return <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.top}><BackButton /><Text style={[styles.topLabel, { color: colors.mutedForeground }]}>RÉPERTOIRE</Text><View style={{ width: 42 }} /></View>{artist.isLoading && <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>}{artist.error && <ErrorState onRetry={() => void artist.refetch()} />}{artist.data && <><View style={styles.profileHero}>{avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: colors.secondary }]}><Ionicons name="person" size={38} color={colors.secondaryForeground} /></View>}<Text style={[styles.name, { color: colors.foreground }]}>{artist.data.name}</Text><Text style={[styles.role, { color: colors.primary }]}>{artist.data.subcategory ?? categoryLabel(artist.data.category)}</Text><Text style={[styles.location, { color: colors.mutedForeground }]}><Ionicons name="location-outline" size={14} /> {artist.data.location}</Text></View><View style={[styles.bioCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.bio, { color: colors.foreground }]}>{artist.data.bio}</Text>{artist.data.specialties.length > 0 && <View style={styles.tags}>{artist.data.specialties.map((item) => <View key={item} style={[styles.tag, { backgroundColor: colors.muted }]}><Text style={[styles.tagText, { color: colors.foreground }]}>{item}</Text></View>)}</View>}</View><View style={[styles.stats, { borderColor: colors.border }]}><View><Text style={[styles.statValue, { color: colors.foreground }]}>{artist.data.worksCount}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>œuvres</Text></View><View><Text style={[styles.statValue, { color: colors.foreground }]}>{artist.data.country ?? '—'}</Text><Text style={[styles.statLabel, { color: colors.mutedForeground }]}>pays</Text></View></View>{(artist.data.website || artist.data.socialLinks.length > 0) && <View style={styles.links}>{artist.data.website && <Pressable onPress={() => void Linking.openURL(artist.data.website!)} style={styles.link}><Ionicons name="globe-outline" size={18} color={colors.primary} /><Text style={[styles.linkText, { color: colors.foreground }]}>Site professionnel</Text></Pressable>}{artist.data.socialLinks.map((link) => <Pressable key={link} onPress={() => void Linking.openURL(link)} style={styles.link}><Ionicons name="link-outline" size={18} color={colors.primary} /><Text numberOfLines={1} style={[styles.linkText, { color: colors.foreground }]}>{link.replace(/^https?:\/\//, '')}</Text></Pressable>)}</View>}</>}</ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 60 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  topLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.5 },
  center: { paddingVertical: 90, alignItems: 'center' },
  profileHero: { alignItems: 'center', paddingVertical: 10 },
  avatar: { width: 122, height: 122, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  name: { fontFamily: 'Inter_700Bold', fontSize: 31, letterSpacing: -1.1, marginTop: 18 },
  role: { fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8 },
  location: { fontFamily: 'Inter_400Regular', fontSize: 13, marginTop: 8 },
  bioCard: { borderRadius: 20, borderWidth: 1, padding: 19, marginTop: 20 },
  bio: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 23 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 16 },
  tag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  tagText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  stats: { flexDirection: 'row', gap: 44, borderBottomWidth: 1, paddingVertical: 22, marginTop: 4 },
  statValue: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  statLabel: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  links: { gap: 12, marginTop: 22 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  linkText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
});