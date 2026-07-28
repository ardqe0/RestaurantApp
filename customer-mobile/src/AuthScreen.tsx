import { StatusBar } from "expo-status-bar";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { login, register } from "./auth";
import type { AuthSession } from "./auth";

type AuthMode = "login" | "register";

export function AuthScreen({
  apiBaseUrl,
  onAuthenticated
}: {
  apiBaseUrl: string;
  onAuthenticated: (session: AuthSession) => void;
}) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const emailInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);

  function keepFormVisible() {
    requestAnimationFrame(() => scrollViewRef.current?.scrollToEnd({ animated: true }));
  }

  async function submit() {
    const normalizedUsername = username.trim();
    if (normalizedUsername.length < 3) {
      setError("Kullanıcı adı en az 3 karakter olmalıdır.");
      return;
    }
    const normalizedEmail = email.trim();
    if (mode === "register" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError("Geçerli bir e-posta adresi girin.");
      return;
    }
    const normalizedPhoneNumber = phoneNumber.trim();
    const phoneDigitCount = normalizedPhoneNumber.replace(/\D/g, "").length;
    if (mode === "register" && (phoneDigitCount < 10 || phoneDigitCount > 15)) {
      setError("Telefon numarası 10 ile 15 rakam arasında olmalıdır.");
      return;
    }
    if (mode === "login" && password.length < 6) {
      setError("Şifrenizi girin.");
      return;
    }
    if (mode === "register" && !isStrongPassword(password)) {
      setError("Şifre en az 8 karakter; büyük harf, küçük harf, rakam ve özel karakter içermelidir.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const session = mode === "login"
        ? await login(apiBaseUrl, normalizedUsername, password)
        : await register(apiBaseUrl, normalizedUsername, password, normalizedEmail, normalizedPhoneNumber);
      onAuthenticated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş işlemi tamamlanamadı.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setError(null);
    setPassword("");
    setEmail("");
    setPhoneNumber("");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.flex}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.container}
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.intro}>
            <Text style={styles.eyebrow}>RESTORAN OTOMASYON</Text>
            <Text style={styles.headline}>Masadan mutfağa, tek akış.</Text>
            <Text style={styles.description}>
              Hesabınızın rolüne göre müşteri sipariş ekranına veya canlı mutfak ekranına yönlendirilirsiniz.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>{mode === "login" ? "Giriş yap" : "Kayıt ol"}</Text>
            <Text style={styles.hint}>
              {mode === "login" ? "Hesabınızla devam edin." : "Yeni hesaplar müşteri rolüyle oluşturulur."}
            </Text>

            <View style={styles.tabs}>
              <AuthTab active={mode === "login"} label="Giriş yap" onPress={() => changeMode("login")} />
              <AuthTab active={mode === "register"} label="Kayıt ol" onPress={() => changeMode("register")} />
            </View>

            <Text style={styles.inputLabel}>Kullanıcı adı</Text>
            <TextInput
              autoCapitalize="none"
              autoComplete="username"
              editable={!isSubmitting}
              onChangeText={setUsername}
              onFocus={keepFormVisible}
              onSubmitEditing={() => {
                if (mode === "register") emailInputRef.current?.focus();
                else passwordInputRef.current?.focus();
              }}
              placeholder="Kullanıcı adınız"
              returnKeyType="next"
              style={styles.input}
              value={username}
            />

            {mode === "register" ? (
              <>
                <Text style={styles.inputLabel}>E-posta</Text>
                <TextInput
                  ref={emailInputRef}
                  autoCapitalize="none"
                  autoComplete="email"
                  editable={!isSubmitting}
                  keyboardType="email-address"
                  onChangeText={setEmail}
                  onFocus={keepFormVisible}
                  onSubmitEditing={() => phoneInputRef.current?.focus()}
                  placeholder="ornek@eposta.com"
                  returnKeyType="next"
                  style={styles.input}
                  value={email}
                />

                <Text style={styles.inputLabel}>Telefon numarası</Text>
                <TextInput
                  ref={phoneInputRef}
                  autoComplete="tel"
                  editable={!isSubmitting}
                  keyboardType="phone-pad"
                  onChangeText={setPhoneNumber}
                  onFocus={keepFormVisible}
                  onSubmitEditing={() => passwordInputRef.current?.focus()}
                  placeholder="05xx xxx xx xx"
                  returnKeyType="next"
                  style={styles.input}
                  value={phoneNumber}
                />
              </>
            ) : null}

            <Text style={styles.inputLabel}>Şifre</Text>
            <TextInput
              ref={passwordInputRef}
              autoCapitalize="none"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              editable={!isSubmitting}
              onChangeText={setPassword}
              onFocus={keepFormVisible}
              onSubmitEditing={() => void submit()}
              placeholder="Şifreniz"
              returnKeyType="done"
              secureTextEntry
              style={styles.input}
              value={password}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable disabled={isSubmitting} onPress={() => void submit()} style={[styles.submit, isSubmitting ? styles.disabled : null]}>
              {isSubmitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitText}>{mode === "login" ? "Giriş yap" : "Hesap oluştur"}</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isStrongPassword(password: string) {
  return password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}

export function LoadingScreen() {
  return (
    <SafeAreaView style={styles.loadingScreen}>
      <StatusBar style="light" />
      <ActivityIndicator color="#a8e0cd" size="large" />
      <Text style={styles.loadingText}>Oturum kontrol ediliyor…</Text>
    </SafeAreaView>
  );
}

function AuthTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active ? styles.tabActive : null]}>
      <Text style={[styles.tabText, active ? styles.tabTextActive : null]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: "#112a32", flex: 1 },
  flex: { flex: 1 },
  container: { flexGrow: 1, gap: 22, justifyContent: "center", padding: 20, paddingBottom: 52, paddingTop: 34 },
  intro: { alignSelf: "center", gap: 8, maxWidth: 520, width: "100%" },
  eyebrow: { color: "#a8e0cd", fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  headline: { color: "#fff", fontSize: 34, fontWeight: "900", lineHeight: 39 },
  description: { color: "#d6eee7", fontSize: 15, lineHeight: 22 },
  card: { alignSelf: "center", backgroundColor: "#fff", borderRadius: 16, gap: 10, maxWidth: 520, padding: 22, width: "100%" },
  title: { color: "#17212b", fontSize: 26, fontWeight: "900" },
  hint: { color: "#65747a", fontSize: 13, lineHeight: 19, marginBottom: 4 },
  tabs: { backgroundColor: "#edf2f1", borderRadius: 9, flexDirection: "row", gap: 6, marginBottom: 5, padding: 4 },
  tab: { alignItems: "center", borderRadius: 7, flex: 1, paddingVertical: 10 },
  tabActive: { backgroundColor: "#146c5f" },
  tabText: { color: "#52636d", fontSize: 13, fontWeight: "800" },
  tabTextActive: { color: "#fff" },
  inputLabel: { color: "#34444b", fontSize: 13, fontWeight: "800", marginTop: 3 },
  input: { borderColor: "#c8d3d5", borderRadius: 8, borderWidth: 1, color: "#17212b", minHeight: 46, paddingHorizontal: 12 },
  error: { backgroundColor: "#fff0ef", borderRadius: 8, color: "#a12d21", fontSize: 13, lineHeight: 18, padding: 10 },
  submit: { alignItems: "center", backgroundColor: "#146c5f", borderRadius: 8, justifyContent: "center", marginTop: 5, minHeight: 47, paddingHorizontal: 15 },
  submitText: { color: "#fff", fontSize: 14, fontWeight: "900" },
  disabled: { opacity: 0.6 },
  loadingScreen: { alignItems: "center", backgroundColor: "#112a32", flex: 1, gap: 12, justifyContent: "center" },
  loadingText: { color: "#d6eee7", fontSize: 14, fontWeight: "700" }
});
