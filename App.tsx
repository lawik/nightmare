import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';

import { PRFeed } from './src/components/PRFeed';
import { fetchPullRequests, PullRequest } from './src/services/github';

const REPO_OWNER = 'lawik';
const REPO_NAME = 'nightmare';

export default function App() {
  const [prs, setPrs] = useState<PullRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPRs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPullRequests(REPO_OWNER, REPO_NAME);
      setPrs(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPrs(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPRs();
  }, [loadPRs]);

  if (loading) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator color="#fff" />
        <Text style={styles.muted}>
          Loading PRs from {REPO_OWNER}/{REPO_NAME}…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <Text style={styles.bigEmoji}>😱</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={loadPRs}>
          <Text style={styles.buttonText}>retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!prs || prs.length === 0) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <Text style={styles.bigEmoji}>🎉</Text>
        <Text style={styles.title}>Inbox Zero</Text>
        <Text style={styles.muted}>
          No open PRs in {REPO_OWNER}/{REPO_NAME}
        </Text>
        <TouchableOpacity style={styles.button} onPress={loadPRs}>
          <Text style={styles.buttonText}>refresh</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      <PRFeed
        prs={prs}
        owner={REPO_OWNER}
        repo={REPO_NAME}
        onRefresh={loadPRs}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  muted: { color: '#888', fontSize: 14, textAlign: 'center' },
  title: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  bigEmoji: { fontSize: 64 },
  errorText: {
    color: '#f87171',
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 320,
  },
  button: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#fff',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
