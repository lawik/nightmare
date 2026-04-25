import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { approvePR, fetchPRFiles, PRFile, PullRequest } from '../services/github';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface Props {
  pr: PullRequest;
  owner: string;
  repo: string;
  active: boolean;
  position: number;
  total: number;
}

export function PRCard({ pr, owner, repo, active, position, total }: Props) {
  const [files, setFiles] = useState<PRFile[] | null>(null);
  const [approved, setApproved] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const heartScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active && files === null) {
      fetchPRFiles(owner, repo, pr.number)
        .then(setFiles)
        .catch(() => setFiles([]));
    }
  }, [active]);

  async function handleApprove() {
    if (approved || approving) return;
    setApproving(true);
    setError(null);

    Animated.sequence([
      Animated.timing(heartScale, {
        toValue: 1,
        duration: 200,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
      Animated.timing(heartScale, {
        toValue: 0,
        duration: 600,
        delay: 400,
        useNativeDriver: true,
      }),
    ]).start();

    try {
      await approvePR(owner, repo, pr.number);
      setApproved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  }

  const isLast = position === total;
  const firstFileWithPatch = files?.find((f) => !!f.patch);
  const diffLines = firstFileWithPatch?.patch?.split('\n').slice(0, 40) ?? [];

  return (
    <View style={styles.card}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.authorRow}>
          <Image source={{ uri: pr.user.avatar_url }} style={styles.avatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.authorLogin}>@{pr.user.login}</Text>
            <Text style={styles.authorMeta}>
              #{pr.number} · {timeAgo(pr.created_at)}
              {pr.draft ? ' · DRAFT' : ''}
            </Text>
          </View>
        </View>

        <Text style={styles.branchRow}>
          {pr.head.ref} → {pr.base.ref}
        </Text>

        <Text style={styles.title}>{pr.title}</Text>

        <View style={styles.statsRow}>
          <Stat label="files" value={String(pr.changed_files ?? '—')} />
          <Stat
            label="added"
            value={`+${pr.additions ?? 0}`}
            color="#4ade80"
          />
          <Stat
            label="removed"
            value={`-${pr.deletions ?? 0}`}
            color="#f87171"
          />
        </View>

        {pr.body && pr.body.trim().length > 0 ? (
          <Text style={styles.body}>{pr.body}</Text>
        ) : (
          <Text style={styles.bodyEmpty}>no description provided 🫠</Text>
        )}

        <Text style={styles.sectionHeader}>changed files</Text>

        {files === null ? (
          <Text style={styles.muted}>loading…</Text>
        ) : files.length === 0 ? (
          <Text style={styles.muted}>no files</Text>
        ) : (
          <View>
            {files.slice(0, 12).map((f) => (
              <View key={f.filename} style={styles.fileRow}>
                <Text
                  style={styles.fileName}
                  numberOfLines={1}
                  ellipsizeMode="middle"
                >
                  {f.filename}
                </Text>
                <Text style={styles.fileStats}>
                  <Text style={{ color: '#4ade80' }}>+{f.additions}</Text>
                  {'  '}
                  <Text style={{ color: '#f87171' }}>-{f.deletions}</Text>
                </Text>
              </View>
            ))}
          </View>
        )}

        {firstFileWithPatch && diffLines.length > 0 && (
          <View style={styles.diffBox}>
            <Text style={styles.diffFilename}>{firstFileWithPatch.filename}</Text>
            {diffLines.map((line, i) => (
              <Text key={i} style={[styles.diffLine, { color: diffColor(line) }]}>
                {line || ' '}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.footerCue}>
          {isLast ? "you're at the end ✨" : 'swipe up for next PR ⬆️'}
        </Text>
      </ScrollView>

      <View style={styles.positionPill}>
        <Text style={styles.positionText}>
          {position} / {total}
        </Text>
      </View>

      <View style={styles.actionRail}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleApprove}
          style={[styles.approveButton, approved && styles.approveButtonDone]}
        >
          <Text style={styles.approveEmoji}>{approved ? '✅' : '👍'}</Text>
        </TouchableOpacity>
        <Text style={styles.approveLabel}>
          {approved ? 'approved' : approving ? '…' : 'approve'}
        </Text>
        {error && <Text style={styles.approveError}>{error}</Text>}
      </View>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartOverlay,
          {
            opacity: heartScale,
            transform: [
              {
                scale: heartScale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.5, 1.5],
                }),
              },
            ],
          },
        ]}
      >
        <Text style={styles.heartEmoji}>👍</Text>
      </Animated.View>
    </View>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function diffColor(line: string): string {
  if (line.startsWith('@@')) return '#60a5fa';
  if (line.startsWith('+')) return '#4ade80';
  if (line.startsWith('-')) return '#f87171';
  return '#aaa';
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  card: {
    height: SCREEN_HEIGHT,
    backgroundColor: '#0a0a0a',
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 100,
    paddingBottom: 140,
    paddingHorizontal: 20,
    gap: 16,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a1a1a' },
  authorLogin: { color: '#fff', fontSize: 16, fontWeight: '600' },
  authorMeta: { color: '#888', fontSize: 13, marginTop: 2 },
  branchRow: { color: '#60a5fa', fontFamily: 'Courier', fontSize: 13 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', lineHeight: 28 },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#1a1a1a',
    paddingVertical: 12,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { color: '#fff', fontSize: 18, fontWeight: '600' },
  statLabel: {
    color: '#666',
    fontSize: 11,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  body: { color: '#ddd', fontSize: 14, lineHeight: 20 },
  bodyEmpty: { color: '#666', fontSize: 14, fontStyle: 'italic' },
  sectionHeader: {
    color: '#888',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 8,
  },
  muted: { color: '#666', fontSize: 13 },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 12,
  },
  fileName: {
    color: '#ddd',
    fontFamily: 'Courier',
    fontSize: 12,
    flex: 1,
  },
  fileStats: { fontFamily: 'Courier', fontSize: 12 },
  diffBox: {
    backgroundColor: '#111',
    padding: 12,
    marginTop: 8,
  },
  diffFilename: {
    color: '#888',
    fontFamily: 'Courier',
    fontSize: 11,
    marginBottom: 8,
  },
  diffLine: { fontFamily: 'Courier', fontSize: 11, lineHeight: 15 },
  footerCue: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 32,
  },
  positionPill: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1a1a1a',
  },
  positionText: {
    color: '#ddd',
    fontSize: 13,
    fontFamily: 'Courier',
  },
  actionRail: {
    position: 'absolute',
    right: 16,
    bottom: 60,
    alignItems: 'center',
    width: 90,
  },
  approveButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveButtonDone: {
    backgroundColor: '#4ade80',
    borderColor: '#4ade80',
  },
  approveEmoji: { fontSize: 32 },
  approveLabel: {
    color: '#fff',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '600',
  },
  approveError: {
    color: '#f87171',
    fontSize: 10,
    marginTop: 4,
    maxWidth: 90,
    textAlign: 'center',
  },
  heartOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heartEmoji: { fontSize: 200 },
});
