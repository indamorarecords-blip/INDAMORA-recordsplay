import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  const colors = useColors();
  return (
    <View style={styles.brandRow}>
      <View style={[styles.mark, { backgroundColor: colors.primary }]}>
        <Ionicons name="musical-notes" size={compact ? 16 : 20} color={colors.primaryForeground} />
      </View>
      <Text style={[styles.brandText, { color: colors.foreground, fontSize: compact ? 16 : 19 }]}>
        INDAMORA <Text style={{ color: colors.primary }}>PLAY</Text>
      </Text>
    </View>
  );
}

export function AppHeader({ title, eyebrow, action }: { title?: string; eyebrow?: string; action?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12, backgroundColor: colors.background }]}>
      <View style={styles.headerTop}>
        <BrandMark compact />
        {action ?? <View style={styles.headerSpacer} />}
      </View>
      {eyebrow && <Text style={[styles.eyebrow, { color: colors.primary }]}>{eyebrow}</Text>}
      {title && <Text style={[styles.headerTitle, { color: colors.foreground }]}>{title}</Text>}
    </View>
  );
}

export function Screen({ children, scroll = false, contentStyle }: { children: ReactNode; scroll?: boolean; contentStyle?: object }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const content = (
    <View style={[styles.screenContent, { paddingBottom: insets.bottom + 110 }, contentStyle]}>
      {children}
    </View>
  );
  if (scroll) {
    return <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>{content}</ScrollView>;
  }
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>{content}</View>;
}

export function IconButton({ name, onPress, label }: { name: keyof typeof Ionicons.glyphMap; onPress: () => void; label: string }) {
  const colors = useColors();
  return (
    <Pressable
      accessibilityLabel={label}
      testID={`button-${label.toLowerCase().replace(/\s+/g, '-')}`}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: colors.card }, pressed && { opacity: 0.68 }]}
    >
      <Ionicons name={name} size={20} color={colors.foreground} />
    </Pressable>
  );
}

export function EmptyState({ icon = 'albums-outline', title, text }: { icon?: keyof typeof Ionicons.glyphMap; title: string; text: string }) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Ionicons name={icon} size={30} color={colors.primary} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const colors = useColors();
  return (
    <View style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Ionicons name="cloud-offline-outline" size={30} color={colors.primary} />
      <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Connexion interrompue</Text>
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Le contenu n’a pas pu être chargé.</Text>
      <Pressable onPress={onRetry} style={({ pressed }) => [styles.primaryButton, { backgroundColor: colors.primary }, pressed && { opacity: 0.75 }]}>
        <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

export function BackButton() {
  const router = useRouter();
  return <IconButton name="arrow-back" label="Retour" onPress={() => router.back()} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenContent: { paddingHorizontal: 20 },
  scrollContent: { flexGrow: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 18 },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerSpacer: { width: 42 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mark: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  brandText: { fontFamily: 'Inter_700Bold', letterSpacing: -0.5 },
  eyebrow: { fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1.7, textTransform: 'uppercase', marginTop: 24 },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -1.1, marginTop: 5 },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  empty: { borderWidth: 1, borderRadius: 20, padding: 24, alignItems: 'center', marginTop: 16 },
  emptyTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 12, textAlign: 'center' },
  emptyText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 6, maxWidth: 280 },
  primaryButton: { borderRadius: 14, paddingHorizontal: 18, paddingVertical: 12, marginTop: 16 },
  primaryButtonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
});