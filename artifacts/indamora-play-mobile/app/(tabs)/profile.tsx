import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/expo';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppHeader, Screen } from '@/components/Brand';
import { useColors } from '@/hooks/useColors';

export default function ProfileScreen() {
  const colors = useColors();
  const router = useRouter();
  const { isLoaded, isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  if (!isLoaded) return <View style={[styles.center, { backgroundColor: colors.background }]}><ActivityIndicator color={colors.primary} /></View>;
  if (!isSignedIn) return <Screen scroll><AppHeader eyebrow="Votre espace" title="Profil" /><View style={[styles.authCard, { backgroundColor: colors.secondary }]}><View style={styles.authIcon}><Ionicons name="person-outline" size={28} color={colors.secondaryForeground} /></View><Text style={[styles.authTitle, { color: colors.secondaryForeground }]}>Un seul compte INDAMORA</Text><Text style={[styles.authText, { color: colors.secondaryForeground }]}>Connectez-vous avec le même compte que sur indamoraplay.com pour retrouver votre espace.</Text><Pressable testID="button-profile-sign-in" onPress={() => router.push('/sign-in')} style={({ pressed }) => [styles.authButton, { backgroundColor: colors.accent }, pressed && { opacity: 0.78 }]}><Text style={[styles.authButtonText, { color: colors.accentForeground }]}>Se connecter</Text><Ionicons name="arrow-forward" size={16} color={colors.accentForeground} /></Pressable><Pressable onPress={() => router.push('/sign-up')}><Text style={[styles.signUpLink, { color: colors.secondaryForeground }]}>Créer un compte</Text></Pressable></View></Screen>;
  return <Screen scroll><AppHeader eyebrow="Votre espace" title={`Bonjour, ${user?.firstName ?? 'vous'}`} /><View style={[styles.userCard, { backgroundColor: colors.card, borderColor: colors.border }]}>{user?.imageUrl ? <Image source={{ uri: user.imageUrl }} style={styles.userImage} /> : <View style={[styles.userImage, { backgroundColor: colors.primary }]}><Ionicons name="person" size={28} color={colors.primaryForeground} /></View>}<View style={styles.userCopy}><Text style={[styles.userName, { color: colors.foreground }]}>{user?.fullName ?? user?.primaryEmailAddress?.emailAddress}</Text><Text style={[styles.userEmail, { color: colors.mutedForeground }]}>{user?.primaryEmailAddress?.emailAddress}</Text></View></View><View style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.border }]}><Pressable onPress={() => router.push('/repertoire')} style={styles.menuItem}><Ionicons name="people-outline" size={20} color={colors.primary} /><Text style={[styles.menuText, { color: colors.foreground }]}>Explorer le Répertoire</Text><Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /></Pressable><Pressable onPress={() => void signOut()} style={styles.menuItem}><Ionicons name="log-out-outline" size={20} color={colors.primary} /><Text style={[styles.menuText, { color: colors.foreground }]}>Se déconnecter</Text><Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} /></Pressable></View></Screen>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  authCard: { borderRadius: 24, padding: 24, marginTop: 10 },
  authIcon: { width: 56, height: 56, borderRadius: 20, backgroundColor: 'rgba(255, 249, 239, .18)', alignItems: 'center', justifyContent: 'center' },
  authTitle: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: -0.7, marginTop: 22 },
  authText: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8, opacity: 0.85 },
  authButton: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 15, paddingHorizontal: 16, paddingVertical: 13, marginTop: 22 },
  authButtonText: { fontFamily: 'Inter_700Bold', fontSize: 13 },
  signUpLink: { fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 18, opacity: 0.8 },
  userCard: { borderRadius: 22, borderWidth: 1, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 10 },
  userImage: { width: 58, height: 58, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  userCopy: { flex: 1 },
  userName: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  userEmail: { fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 5 },
  menuCard: { borderRadius: 22, borderWidth: 1, marginTop: 14, overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 18, paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D8CBB8' },
  menuText: { flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
});