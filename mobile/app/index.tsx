import { Redirect, router } from 'expo-router';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useEffect, useState } from 'react';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/hooks/use-auth';
import { useTheme } from '@/hooks/use-theme';

export default function PublicHomeScreen() {
  const { status } = useAuth();
  const theme = useTheme();
  const { width } = useWindowDimensions();

const [fadeAnim] = useState(() => new Animated.Value(0));
const [slideAnim] = useState(() => new Animated.Value(24));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }),
      Animated.spring(slideAnim, {
        toValue: 0,
        friction: 8,
        tension: 45,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  if (status === 'authenticated') {
    return <Redirect href="/(drawer)/(tabs)" />;
  }

  const isSmallScreen = width < 380;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Animated.View
            style={[
              styles.container,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="TrackTrail home"
                onPress={() => {}}
                style={({ pressed }) => [
                  styles.brand,
                  pressed && styles.pressed,
                ]}
              >
                <View
                  style={[
                    styles.logo,
                    {
                      backgroundColor: theme.tint,
                      shadowColor: theme.tint,
                    },
                  ]}
                >
                  <ThemedText style={styles.logoText}>TT</ThemedText>
                </View>

                <View>
                  <ThemedText type="smallBold" style={styles.brandName}>
                    TrackTrail
                  </ThemedText>
                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                    style={styles.brandTagline}
                  >
                    Your career, organized.
                  </ThemedText>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Log in"
                onPress={() => router.push('/(auth)/role')}
                style={({ pressed }) => [
                  styles.headerLogin,
                  { borderColor: theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText
                  type="smallBold"
                  style={{ color: theme.tint }}
                >
                  Log in
                </ThemedText>
              </Pressable>
            </View>

            {/* Hero */}
            <View style={styles.heroSection}>
              <View
                style={[
                  styles.eyebrow,
                  {
                    backgroundColor: `${theme.tint}12`,
                    borderColor: `${theme.tint}25`,
                  },
                ]}
              >
                <View
                  style={[
                    styles.liveDot,
                    { backgroundColor: theme.tint },
                  ]}
                />

                <ThemedText
                  type="smallBold"
                  style={{ color: theme.tint }}
                >
                  BUILT FOR SERIOUS JOB SEEKERS
                </ThemedText>
              </View>

              <ThemedText
                type="title"
                style={[
                  styles.heroTitle,
                  isSmallScreen && styles.heroTitleSmall,
                ]}
              >
                Stop managing your job search in your{' '}
                <ThemedText
                  type="title"
                  style={[
                    styles.heroTitle,
                    styles.highlight,
                    { color: theme.tint },
                    isSmallScreen && styles.heroTitleSmall,
                  ]}
                >
                  head.
                </ThemedText>
              </ThemedText>

              <ThemedText
                type="subtitle"
                themeColor="textSecondary"
                style={styles.heroDescription}
              >
                Track applications, prepare better, tailor your resume
                with evidence, and always know what to do next.
              </ThemedText>

              {/* Primary CTA */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create your free TrackTrail workspace"
                onPress={() => router.push('/(auth)/register')}
                style={({ pressed }) => [
                  styles.primaryButton,
                  {
                    backgroundColor: theme.tint,
                    shadowColor: theme.tint,
                  },
                  pressed && styles.primaryPressed,
                ]}
              >
                <View style={styles.buttonContent}>
                  <ThemedText style={styles.primaryButtonText}>
                    Create free workspace
                  </ThemedText>

                  <View style={styles.arrowCircle}>
                    <ThemedText style={styles.arrow}>→</ThemedText>
                  </View>
                </View>
              </Pressable>

              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.noCardText}
              >
                Free to start · No credit card required
              </ThemedText>
            </View>

            {/* Product Preview */}
            <View
              style={[
                styles.previewCard,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                  shadowColor: theme.text,
                },
              ]}
            >
              <View style={styles.previewHeader}>
                <View>
                  <ThemedText type="smallBold">
                    Application pipeline
                  </ThemedText>

                  <ThemedText
                    type="small"
                    themeColor="textSecondary"
                  >
                    This week
                  </ThemedText>
                </View>

                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${theme.tint}12` },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    style={{ color: theme.tint }}
                  >
                    On track
                  </ThemedText>
                </View>
              </View>

              <View style={styles.statsRow}>
                <Stat
                  value="12"
                  label="Applied"
                  theme={theme}
                />

                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: theme.border },
                  ]}
                />

                <Stat
                  value="4"
                  label="Interviews"
                  theme={theme}
                />

                <View
                  style={[
                    styles.statDivider,
                    { backgroundColor: theme.border },
                  ]}
                />

                <Stat
                  value="68%"
                  label="Response"
                  theme={theme}
                />
              </View>

              <View style={styles.progressHeader}>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                >
                  Weekly progress
                </ThemedText>

                <ThemedText type="smallBold">72%</ThemedText>
              </View>

              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.border },
                ]}
              >
                <View
                  style={[
                    styles.progressBar,
                    {
                      backgroundColor: theme.tint,
                      width: '72%',
                    },
                  ]}
                />
              </View>
            </View>

            {/* Feature Section */}
            <View style={styles.section}>
              <View style={styles.sectionHeading}>
                <ThemedText type="title" style={styles.sectionTitle}>
                  Everything in one place.
                </ThemedText>

                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  style={styles.sectionDescription}
                >
                  Designed to reduce the chaos around your job search.
                </ThemedText>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.featureScroll}
              >
                <FeatureCard
                  number="01"
                  title="One source of truth"
                  description="Applications, interviews, notes and follow-ups stay organized."
                  icon="✓"
                  theme={theme}
                />

                <FeatureCard
                  number="02"
                  title="Evidence-first resumes"
                  description="Tailor your resume without inventing experience or skills."
                  icon="◆"
                  theme={theme}
                />

                <FeatureCard
                  number="03"
                  title="Know what matters"
                  description="See where your pipeline is weak and focus on the next action."
                  icon="↗"
                  theme={theme}
                />
              </ScrollView>
            </View>

            {/* How it works */}
            <View
              style={[
                styles.howSection,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.border,
                },
              ]}
            >
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                HOW TRACKTRAIL WORKS
              </ThemedText>

              <ThemedText type="title" style={styles.howTitle}>
                From scattered applications to a clear plan.
              </ThemedText>

              <Step
                number="1"
                title="Capture"
                description="Add the jobs you're actually pursuing."
                theme={theme}
              />

              <Step
                number="2"
                title="Organize"
                description="Track every stage, deadline and follow-up."
                theme={theme}
              />

              <Step
                number="3"
                title="Improve"
                description="Use your data to decide what to do next."
                theme={theme}
              />
            </View>

            {/* Bottom CTA */}
            <View
              style={[
                styles.bottomCTA,
                {
                  backgroundColor: theme.tint,
                  shadowColor: theme.tint,
                },
              ]}
            >
              <View style={styles.ctaOrb} />

              <ThemedText style={styles.ctaTitle}>
                Your next opportunity deserves a better system.
              </ThemedText>

              <ThemedText style={styles.ctaDescription}>
                Start building a more intentional job search today.
              </ThemedText>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Get started with TrackTrail"
                onPress={() => router.push('/(auth)/register')}
                style={({ pressed }) => [
                  styles.ctaButton,
                  pressed && styles.ctaPressed,
                ]}
              >
                <ThemedText
                  type="smallBold"
                  style={{ color: theme.tint }}
                >
                  Get started
                </ThemedText>

                <ThemedText
                  type="smallBold"
                  style={{ color: theme.tint }}
                >
                  →
                </ThemedText>
              </Pressable>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.footerText}
              >
                © {new Date().getFullYear()} TrackTrail
              </ThemedText>

              <ThemedText
                type="small"
                themeColor="textSecondary"
                style={styles.footerText}
              >
                Built for focused job seekers.
              </ThemedText>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/* ----------------------------- Components ----------------------------- */

function Stat({
  value,
  label,
  theme,
}: {
  value: string;
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stat}>
      <ThemedText type="title" style={styles.statValue}>
        {value}
      </ThemedText>

      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={styles.statLabel}
      >
        {label}
      </ThemedText>
    </View>
  );
}

function FeatureCard({
  number,
  title,
  description,
  icon,
  theme,
}: {
  number: string;
  title: string;
  description: string;
  icon: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.featureCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.border,
        },
        pressed && styles.featurePressed,
      ]}
    >
      <View style={styles.featureTop}>
        <View
          style={[
            styles.featureIcon,
            { backgroundColor: `${theme.tint}12` },
          ]}
        >
          <ThemedText
            type="smallBold"
            style={{ color: theme.tint }}
          >
            {icon}
          </ThemedText>
        </View>

        <ThemedText
          type="smallBold"
          themeColor="textSecondary"
        >
          {number}
        </ThemedText>
      </View>

      <ThemedText type="subtitle" style={styles.featureTitle}>
        {title}
      </ThemedText>

      <ThemedText
        type="small"
        themeColor="textSecondary"
        style={styles.featureDescription}
      >
        {description}
      </ThemedText>

      <View style={styles.featureArrow}>
        <ThemedText
          type="smallBold"
          style={{ color: theme.tint }}
        >
          Explore →
        </ThemedText>
      </View>
    </Pressable>
  );
}

function Step({
  number,
  title,
  description,
  theme,
}: {
  number: string;
  title: string;
  description: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.step}>
      <View
        style={[
          styles.stepNumber,
          {
            backgroundColor: `${theme.tint}12`,
            borderColor: `${theme.tint}25`,
          },
        ]}
      >
        <ThemedText
          type="smallBold"
          style={{ color: theme.tint }}
        >
          {number}
        </ThemedText>
      </View>

      <View style={styles.stepContent}>
        <ThemedText type="smallBold">{title}</ThemedText>

        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.stepDescription}
        >
          {description}
        </ThemedText>
      </View>
    </View>
  );
}

/* ------------------------------- Styles ------------------------------- */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  safe: {
    flex: 1,
  },

  scrollContent: {
    paddingBottom: 32,
  },

  container: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },

  /* Header */

  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  logo: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',

    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 5,
    },

    elevation: 5,
  },

  logoText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  brandName: {
    fontSize: 16,
  },

  brandTagline: {
    marginTop: 1,
    fontSize: 10,
  },

  headerLogin: {
    minHeight: 38,
    paddingHorizontal: 15,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Hero */

  heroSection: {
    paddingTop: 28,
    paddingBottom: 30,
  },

  eyebrow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 18,
  },

  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  heroTitle: {
    fontSize: 42,
    lineHeight: 47,
    letterSpacing: -1.5,
    maxWidth: 680,
  },

  heroTitleSmall: {
    fontSize: 36,
    lineHeight: 41,
  },

  highlight: {
    fontSize: 42,
    lineHeight: 47,
  },

  heroDescription: {
    marginTop: 16,
    lineHeight: 24,
    maxWidth: 610,
  },

  primaryButton: {
    minHeight: 56,
    borderRadius: 17,
    marginTop: 25,
    paddingLeft: 20,
    paddingRight: 7,
    justifyContent: 'center',

    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: {
      width: 0,
      height: 8,
    },

    elevation: 7,
  },

  primaryPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },

  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  primaryButtonText: {
    color: '#fff',
    fontSize: 15,
  },

  arrowCircle: {
    width: 43,
    height: 43,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  arrow: {
    color: '#fff',
    fontSize: 21,
  },

  noCardText: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 11,
  },

  /* Product preview */

  previewCard: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 20,

    shadowOpacity: 0.07,
    shadowRadius: 18,
    shadowOffset: {
      width: 0,
      height: 8,
    },

    elevation: 3,
  },

  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 22,
  },

  stat: {
    flex: 1,
    alignItems: 'center',
  },

  statValue: {
    fontSize: 25,
    lineHeight: 29,
  },

  statLabel: {
    marginTop: 3,
    fontSize: 10,
  },

  statDivider: {
    width: 1,
    height: 35,
  },

  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 8,
  },

  progressTrack: {
    height: 7,
    borderRadius: 99,
    overflow: 'hidden',
  },

  progressBar: {
    height: '100%',
    borderRadius: 99,
  },

  /* Feature section */

  section: {
    marginTop: 42,
  },

  sectionHeading: {
    marginBottom: 18,
  },

  sectionTitle: {
    fontSize: 25,
    lineHeight: 31,
    letterSpacing: -0.5,
  },

  sectionDescription: {
    marginTop: 6,
    lineHeight: 20,
  },

  featureScroll: {
    gap: 12,
    paddingRight: 20,
  },

  featureCard: {
    width: 270,
    minHeight: 225,
    borderWidth: 1,
    borderRadius: 22,
    padding: 18,
  },

  featurePressed: {
    transform: [{ scale: 0.975 }],
    opacity: 0.9,
  },

  featureTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },

  featureIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  featureTitle: {
    fontSize: 17,
    marginBottom: 8,
  },

  featureDescription: {
    lineHeight: 20,
  },

  featureArrow: {
    marginTop: 'auto',
  },

  /* How it works */

  howSection: {
    marginTop: 42,
    borderWidth: 1,
    borderRadius: 24,
    padding: 21,
  },

  howTitle: {
    fontSize: 25,
    lineHeight: 31,
    marginTop: 8,
    marginBottom: 22,
  },

  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    marginBottom: 19,
  },

  stepNumber: {
    width: 35,
    height: 35,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepContent: {
    flex: 1,
    paddingTop: 2,
  },

  stepDescription: {
    marginTop: 3,
    lineHeight: 19,
  },

  /* Bottom CTA */

  bottomCTA: {
    overflow: 'hidden',
    position: 'relative',
    marginTop: 42,
    borderRadius: 27,
    padding: 24,

    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: {
      width: 0,
      height: 10,
    },

    elevation: 7,
  },

  ctaOrb: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    right: -70,
    top: -80,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },

  ctaTitle: {
    color: '#fff',
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    maxWidth: 500,
  },

  ctaDescription: {
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 21,
    marginTop: 9,
    maxWidth: 500,
  },

  ctaButton: {
    alignSelf: 'flex-start',
    minHeight: 46,
    paddingHorizontal: 17,
    marginTop: 19,
    borderRadius: 14,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  ctaPressed: {
    transform: [{ scale: 0.96 }],
    opacity: 0.9,
  },

  /* Footer */

  footer: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 4,
  },

  footerText: {
    fontSize: 10,
  },

  pressed: {
    opacity: 0.7,
  },
});