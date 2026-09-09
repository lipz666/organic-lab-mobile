import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { RdkitHost } from "../src/chem/RdkitHost";
import { SettingsProvider } from "../src/config/SettingsContext";
import { getDatabase } from "../src/db";
import { theme } from "../src/ui/theme";

export default function RootLayout() {
  const [dbError, setDbError] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    getDatabase()
      .then(() => setDbReady(true))
      .catch((error: unknown) => setDbError(error instanceof Error ? error.message : String(error)));
  }, []);

  if (dbError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>本地数据库打不开</Text>
        <Text style={styles.errorBody}>{dbError}</Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <StatusBar style="dark" />
        <RdkitHost />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.bg },
            headerTintColor: theme.text,
            headerShadowVisible: false,
            headerTitleStyle: { fontSize: 17, fontWeight: "600" },
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.bg,
    padding: theme.space(6),
  },
  errorTitle: { color: theme.danger, fontSize: 16, fontWeight: "600", marginBottom: theme.space(2) },
  errorBody: { color: theme.textDim, fontSize: 13, textAlign: "center" },
});
