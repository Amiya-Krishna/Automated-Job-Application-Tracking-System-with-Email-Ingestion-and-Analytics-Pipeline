import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { reportError } from '@/services/logger';

/**
 * Last-resort screen for a render crash. Deliberately uses only core RN
 * primitives and hard-coded colours so it can never itself depend on the
 * (possibly broken) theme/auth/query providers. The error is reported without
 * its component stack payload (which can include prop text).
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    reportError(error, { boundary: 'root' });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>TrackTrail hit an unexpected problem. Your data is safe.</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Try again" onPress={() => this.setState({ failed: false })} style={styles.button}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#06102a', gap: 12 },
  title: { color: '#ffffff', fontSize: 20, fontWeight: '700', textAlign: 'center' },
  body: { color: '#cbd5e1', fontSize: 15, textAlign: 'center' },
  button: { marginTop: 8, minHeight: 48, minWidth: 140, borderRadius: 12, backgroundColor: '#2563eb', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
