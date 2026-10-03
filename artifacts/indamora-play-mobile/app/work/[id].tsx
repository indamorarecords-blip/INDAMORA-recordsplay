import { Ionicons } from '@expo/vector-icons';
import { getGetWorkQueryKey, useGetWork } from '@workspace/api-client-react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BackButton, ErrorState } from '@/components/Brand';
import { useColors } from '@/hooks/useColors';
import { categoryLabel, resolveMediaUrl } from '@/lib/media';

export default function WorkDetailScreen() {
  const colors = useColors();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workId = Number(id);
  const work = useGetWork(workId, { query: { enabled: Number.isFinite(workId), queryKey: getGetWorkQueryKey(workId) } });
  const artwork = resolveMediaUrl(work.data?.coverObjectPath) ?? resolveMediaUrl(work.data?.image);
  return <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}><View style={styles.top}><BackButton /><Text style={[styles.topLabel, { color: colors.mutedForeground }]}>FICHE DE L’ŒUVRE</Text><View style={{ width: 42 }} /></View>{work.isLoading && <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>}{work.error && <ErrorState onRetry={() => void work.refetch()} />}{work.data && <><View style={[styles.cover, { backgroundColor: colors.secondary }]}>{artwork ? <Image source={{ uri: artwork }} style={styles.coverImage} /> : <Ionicons name="musical-notes" size={54} color={colors.secondaryForeground} />}<View style={styles.coverShade} /><View style={styles.coverPlay}><Ionicons name={work.data.mediaObjectPath ? 'play' : 'musical-notes'} size={26} color={colors.accentForeground} /></View></View><Text style={[styles.category, { color: colors.primary }]}>{categoryLabel(work.data.category)} · {work.data.duration ?? 'Durée à venir'}</Text><Text style={[styles.title, { color: colors.foreground }]}>{work.data.title}</Text><Text style={[styles.artist, { color: colors.mutedForeground }]}>{work.data.artist}</Text><Text style={[styles.description, { color: colors.mutedForeground }]}>{work.data.description}</Text>{work.data.mediaObjectPath ? <Pressable onPress={() => { const url = resolveMediaUrl(work.data?.mediaObjectPath); if (url) void Linking.openURL(url); }} style={({ pressed }) => [styles.listenButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.78 }]}><Ionicons name="headset" size={18} color={colors.primaryForeground} /><Text style={[styles.listenText, { color: colors.primaryForeground }]}>Ouvrir le média</Text></Pressable> : <View style={[styles.unavailable, { backgroundColor: colors.muted }]}><Ionicons name="time-outline" size={18} color={colors.mutedForeground} /><Text style={[styles.unavailableText, { color: colors.mutedForeground }]}>Le média sera disponible après sa publication.</Text></View>}</>}</ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 54, paddingBottom: 60 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 },
  topLabel: { fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.5 },
  center: { paddingVertical: 90, alignItems: 'center' },
  cover: { height: 320, borderRadius: 26, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  coverImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  coverShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(20, 14, 10, .28)' },
  coverPlay: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#F4C44E', alignItems: 'center', justifyContent: 'center' },
  category: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 24 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1.2, marginTop: 7 },
  artist: { fontFamily: 'Inter_600SemiBold', fontSize: 15, marginTop: 7 },
  description: { fontFamily: 'Inter_400Regular', fontSize: 15, lineHeight: 24, marginTop: 22 },
  listenButton: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingVertical: 15, marginTop: 28 },
  listenText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  unavailable: { borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 9, padding: 15, marginTop: 28 },
  unavailableText: { flex: 1, fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18 },
});