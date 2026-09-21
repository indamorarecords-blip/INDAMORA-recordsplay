import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useSSO, useSignIn } from '@clerk/expo';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { BrandMark } from '@/components/Brand';
import { useColors } from '@/hooks/useColors';

WebBrowser.maybeCompleteAuthSession();

export default function SignInScreen() {
  const colors = useColors();
  const router = useRouter();
  const { signIn, errors, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [googleError, setGoogleError] = useState('');
  const warmUp = useCallback(() => { if (process.env.EXPO_PUBLIC_DOMAIN) return; }, []);
  useEffect(() => { void warmUp(); }, [warmUp]);
  const finish = async () => { await signIn.finalize({ navigate: () => router.replace('/(tabs)') }); };
  const submit = async () => {
    const result = await signIn.password({ emailAddress: email.trim(), password });
    if (result.error) return;
    if (signIn.status === 'complete') await finish();
    else if (signIn.status === 'needs_client_trust') await signIn.mfa.sendEmailCode();
  };
  const google = async () => {
    try {
      setGoogleError('');
      const result = await startSSOFlow({ strategy: 'oauth_google', redirectUrl: AuthSession.makeRedirectUri({ scheme: 'indamora-play-mobile' }) });
      if (result.createdSessionId) await result.setActive!({ session: result.createdSessionId, navigate: () => router.replace('/(tabs)') });
    } catch { setGoogleError('La connexion Google n’a pas abouti.'); }
  };
  const verify = async () => { await signIn.mfa.verifyEmailCode({ code }); if (signIn.status === 'complete') await finish(); };
  const busy = fetchStatus === 'fetching';
  return <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><BrandMark /><Text style={[styles.eyebrow, { color: colors.primary }]}>VOTRE ESPACE INDAMORA</Text><Text style={[styles.title, { color: colors.foreground }]}>Ravi de vous revoir.</Text><Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Retrouvez le même compte que sur le site principal.</Text>{signIn.status === 'needs_client_trust' ? <><Text style={[styles.label, { color: colors.foreground }]}>Code reçu par email</Text><TextInput value={code} onChangeText={setCode} keyboardType="number-pad" placeholder="000000" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Pressable onPress={verify} disabled={busy} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, busy && styles.disabled, pressed && { opacity: 0.78 }]}>{busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Vérifier</Text>}</Pressable></> : <><Text style={[styles.label, { color: colors.foreground }]}>Adresse email</Text><TextInput testID="input-sign-in-email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="vous@exemple.com" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.label, { color: colors.foreground }]}>Mot de passe</Text><TextInput testID="input-sign-in-password" secureTextEntry value={password} onChangeText={setPassword} placeholder="Votre mot de passe" placeholderTextColor={colors.mutedForeground} style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]} /><Text style={[styles.error, { color: colors.destructive }]}>{errors.fields.identifier?.message ?? errors.fields.password?.message ?? ''}</Text><Pressable testID="button-sign-in" onPress={submit} disabled={!email || !password || busy} style={({ pressed }) => [styles.button, { backgroundColor: colors.primary }, (!email || !password || busy) && styles.disabled, pressed && { opacity: 0.78 }]}>{busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>Se connecter</Text>}</Pressable><View style={styles.divider}><View style={[styles.line, { backgroundColor: colors.border }]} /><Text style={[styles.or, { color: colors.mutedForeground }]}>ou</Text><View style={[styles.line, { backgroundColor: colors.border }]} /></View><Pressable onPress={google} style={({ pressed }) => [styles.google, { borderColor: colors.border, backgroundColor: colors.card }, pressed && { opacity: 0.78 }]}><Text style={[styles.googleText, { color: colors.foreground }]}>Continuer avec Google</Text></Pressable>{googleError && <Text style={[styles.error, { color: colors.destructive }]}>{googleError}</Text>}</>}<Text style={[styles.footer, { color: colors.mutedForeground }]}>Pas encore de compte ? <Link href="/sign-up" style={{ color: colors.primary }}>Créer un compte</Link></Text></ScrollView>;
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
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 24 },
  line: { flex: 1, height: 1 },
  or: { fontFamily: 'Inter_400Regular', fontSize: 12 },
  google: { minHeight: 52, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  googleText: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  footer: { fontFamily: 'Inter_400Regular', fontSize: 13, textAlign: 'center', marginTop: 28 },
});