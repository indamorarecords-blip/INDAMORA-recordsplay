import { useSignUp } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { BrandMark } from '@/components/Brand';
import { useColors } from '@/hooks/useColors';

export default function SignUpScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signUp, errors, fetchStatus } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const submit = async () => { const result = await signUp.password({ emailAddress: email.trim(), password }); if (!result.error) await signUp.verifications.sendEmailCode(); };
  const verify = async () => { await signUp.verifications.verifyEmailCode({ code }); if (signUp.status === 'complete') await signUp.finalize({ navigate: () => router.replace('/(tabs)') }); };
  const busy = fetchStatus === 'fetching';
  return <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><BrandMark /><Text style={[styles.eyebrow, { color: colors.primary }]}>REJOINDRE LA COMMUNAUTÉ</Text><Text style={[styles.title, { color: colors.foreground }]}>Créer votre espace.</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Un compte unique pour le site et l’application INDAMORA PLAY.</Text>{signUp.status === 'missing_requirements' && signUp.unverifiedFields.includes('email_address') ? <><Text style={[styles.label, { color: colors.foreground }]}>Code de vérification</Text><TextInput value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="000000" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={verify} disabled={busy} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, busy && styles.disabled, pressed && { opacity: 0.78 }]}>{busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Valider mon compte</Text>}</Pressable><Pressable onPress={() => void signUp.verifications.sendEmailCode()}><Text style={[styles.resend, { color: colors.primary }]}>Renvoyer le code</Text></Pressable></> : <><Text style={[styles.label, { color: colors.foreground }]}>Adresse email</Text><TextInput testID="input-sign-up-email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="vous@exemple.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.label, { color: colors.foreground }]}>Mot de passe</Text><TextInput testID="input-sign-up-password" secureTextEntry value={password} onChangeText={setPassword} placeholder="8 caractères minimum" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.error, { color: colors.destructive }]}>{errors.fields.emailAddress?.message ?? errors.fields.password?.message ?? ''}</Text><Pressable testID="button-sign-up" onPress={submit} disabled={!email || !password || busy} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (!email || !password || busy) && styles.disabled, pressed && { opacity: 0.78 }]}>{busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Créer mon compte</Text>}</Pressable></>}<Text style={[styles.footer, { color: colors.mutedForeground }]}>Déjà un compte ? <Link href="/sign-in" style={{ color: colors.primary }}>Se connecter</Link></Text></ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 24, paddingTop: 72, paddingBottom: 60 },
  eyebrow: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6, marginTop: 54 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34, letterSpacing: -1.2, marginTop: 10 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 10, marginBottom: 28 },
  label: { fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 16, marginBottom: 7 },
  input: { height: 52, borderRadius: 15, borderWidth: 1, paddingHorizontal: 15, fontFamily: 'Inter_400Regular', fontSize: 14 },
  error: { fontFamily: 'Inter_400Regular', fontSize: 12, minHeight: 18, marginTop: 7 },
  button: { minHeight: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  buttonText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  disabled: { opacity: 0.45 },
  resend: { textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 18 },
  footer: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', marginTop: 28 },
});