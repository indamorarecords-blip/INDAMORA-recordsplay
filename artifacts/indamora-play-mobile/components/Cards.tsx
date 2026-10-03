import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Artist, Work } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { categoryLabel, resolveMediaUrl } from '@/lib/media';

export function WorkCard({ work, onPress, wide = false }: { work: Work; onPress: () => void; wide?: boolean }) {
  const colors = useColors();
  const artwork = resolveMediaUrl(work.coverObjectPath) ?? resolveMediaUrl(work.image);
  return (
    <Pressable testID={`card-work-${work.id}`} onPress={onPress} style={({ pressed }) => [wide ? styles.workWide : styles.work, pressed && { opacity: 0.78, transform: [{ scale: 0.985 }] }]}>
      <View style={[styles.artwork, { backgroundColor: colors.secondary }, wide && styles.artworkWide]}>
        {artwork ? <Image source={{ uri: artwork }} style={styles.artworkImage} /> : <Ionicons name="musical-notes" size={35} color={colors.secondaryForeground} />}
        <View style={styles.artworkShade} />
        {work.access === 'premium' && <View style={[styles.premiumBadge, { backgroundColor: colors.accent }]}><Ionicons name="lock-closed" size={12} color={colors.accentForeground} /></View>}
        <View style={styles.artworkMeta}><Text style={styles.artworkCategory}>{categoryLabel(work.category)}</Text><Text style={styles.artworkDuration}>{work.duration ?? '—'}</Text></View>
      </View>
      <Text numberOfLines={1} style={[styles.workTitle, { color: colors.foreground }]}>{work.title}</Text>
      <Text numberOfLines={1} style={[styles.workArtist, { color: colors.mutedForeground }]}>{work.artist}</Text>
    </Pressable>
  );
}

export function ArtistCard({ artist, onPress }: { artist: Artist; onPress: () => void }) {
  const colors = useColors();
  const avatar = resolveMediaUrl(artist.avatar);
  return (
    <Pressable testID={`card-artist-${artist.id}`} onPress={onPress} style={({ pressed }) => [styles.artistCard, { backgroundColor: colors.card, borderColor: colors.border }, pressed && { opacity: 0.78 }]}>
      {avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.secondary }]}><Ionicons name="person" size={24} color={colors.secondaryForeground} /></View>}
      <View style={styles.artistCopy}>
        <Text numberOfLines={1} style={[styles.artistName, { color: colors.foreground }]}>{artist.name}</Text>
        <Text numberOfLines={1} style={[styles.artistMeta, { color: colors.primary }]}>{artist.subcategory ?? categoryLabel(artist.category)}</Text>
        <Text numberOfLines={1} style={[styles.artistLocation, { color: colors.mutedForeground }]}>{artist.location}</Text>
      </View>
      <Ionicons name="chevron-forward" size={19} color={colors.mutedForeground} />
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return <View style={styles.sectionTitle}><Text style={[styles.sectionText, { color: colors.foreground }]}>{title}</Text>{action && onAction && <Pressable onPress={onAction}><Text style={[styles.sectionAction, { color: colors.primary }]}>{action}</Text></Pressable>}</View>;
}

const styles = StyleSheet.create({
  work: { width: 154, marginRight: 14 },
  workWide: { width: 190, marginRight: 14 },
  artwork: { height: 154, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  artworkWide: { height: 190 },
  artworkImage: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  artworkShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(18, 13, 10, .18)' },
  premiumBadge: { position: 'absolute', top: 10, right: 10, width: 27, height: 27, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  artworkMeta: { position: 'absolute', bottom: 10, left: 11, right: 11, flexDirection: 'row', justifyContent: 'space-between' },
  artworkCategory: { color: '#FFF9EF', fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  artworkDuration: { color: '#FFF9EF', fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  workTitle: { fontFamily: 'Inter_700Bold', fontSize: 15, marginTop: 10 },
  workArtist: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 4 },
  artistCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 18, padding: 12, gap: 12, marginBottom: 10 },
  avatar: { width: 56, height: 56, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  artistCopy: { flex: 1, minWidth: 0 },
  artistName: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  artistMeta: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 4 },
  artistLocation: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 3 },
  sectionTitle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 26, marginBottom: 12 },
  sectionText: { fontFamily: 'Inter_700Bold', fontSize: 21, letterSpacing: -0.6 },
  sectionAction: { fontFamily: 'Inter_700Bold', fontSize: 12 },
});