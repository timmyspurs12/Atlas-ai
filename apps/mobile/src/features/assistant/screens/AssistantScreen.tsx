import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AssistantResponse } from '@atlas/contracts';
import { Bot, ChevronRight, Clock3, MapPin, Navigation, Route, Send, ShieldCheck, Sparkles } from 'lucide-react-native';
import { AtlasText } from '@/components/ui/AtlasText';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { apiRequest } from '@/shared/api/api-client';
import { palette, radii, shadow, spacing, typography } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  action?: AssistantResponse['action'];
  notice?: string | null;
}

const suggestions = [
  { text: 'Where is Sarah?', icon: MapPin, color: '#8B5CF6' },
  { text: 'Who is closest to me?', icon: Navigation, color: palette.teal },
  { text: 'Replay yesterday’s journey', icon: Route, color: palette.blue },
  { text: 'My weekly travel report', icon: Clock3, color: palette.amber },
];

export function AssistantScreen() {
  const theme = useAtlasTheme();
  const mode = useAppSelector((state) => state.auth.mode);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi Maya — I can help with people who are actively sharing with you, your trips, ETAs, and travel insights. What would you like to know?',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const scrollRef = useRef<ScrollView>(null);

  const ask = async (question: string): Promise<void> => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setMessages((current) => [...current, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    try {
      let response: AssistantResponse;
      if (mode === 'demo') {
        await new Promise((resolve) => setTimeout(resolve, 680));
        response = demoAnswer(trimmed);
      } else {
        response = await apiRequest<AssistantResponse>('/assistant/ask', {
          method: 'POST',
          body: { question: trimmed, conversationId, preciseLocationConsent: false },
        });
      }
      setConversationId(response.conversationId);
      setMessages((current) => [
        ...current,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: response.answer,
          action: response.action,
          notice: response.safetyNotice,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          text: 'I couldn’t reach Atlas AI just now. Your existing location and trip data remain private and available offline.',
        },
      ]);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={88}>
        <View style={[styles.header, { borderColor: theme.colors.border }]}>
          <View style={styles.aiLogo}><Sparkles size={21} color={palette.white} /></View>
          <View style={styles.flex}>
            <AtlasText variant="h3">Atlas Assistant</AtlasText>
            <View style={styles.online}><View style={styles.greenDot} /><AtlasText variant="micro" color={palette.green}>PRIVACY-SCOPED</AtlasText></View>
          </View>
          <View style={styles.secure}><ShieldCheck size={15} color={palette.teal} /><AtlasText variant="micro" color={palette.teal}>CONSENT ONLY</AtlasText></View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={styles.messages}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.privacyCard}>
            <ShieldCheck size={18} color={palette.teal} />
            <AtlasText variant="caption" color={theme.colors.textMuted} style={styles.flex}>
              I only use locations people currently share with you. I cannot find anyone without permission.
            </AtlasText>
          </Card>

          {messages.map((message) => (
            <View key={message.id} style={[styles.messageRow, message.role === 'user' && styles.userMessageRow]}>
              {message.role === 'assistant' ? (
                <View style={styles.botAvatar}><Bot size={17} color={palette.white} /></View>
              ) : null}
              <View
                style={[
                  styles.bubble,
                  message.role === 'user'
                    ? styles.userBubble
                    : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                <AtlasText color={message.role === 'user' ? palette.white : theme.colors.text}>
                  {message.text}
                </AtlasText>
                {message.action && message.action.type !== 'NONE' ? (
                  <Pressable style={[styles.action, { borderColor: message.role === 'user' ? 'rgba(255,255,255,0.25)' : theme.colors.border }]}>
                    <AtlasText variant="label" color={message.role === 'user' ? palette.white : palette.blue}>
                      {message.action.type === 'OPEN_PERSON' ? 'Open live map' : message.action.type === 'OPEN_TRIP' ? 'Replay journey' : 'View report'}
                    </AtlasText>
                    <ChevronRight size={16} color={message.role === 'user' ? palette.white : palette.blue} />
                  </Pressable>
                ) : null}
                {message.notice ? <AtlasText variant="micro" color={theme.colors.textMuted}>{message.notice.toUpperCase()}</AtlasText> : null}
              </View>
            </View>
          ))}
          {loading ? (
            <View style={styles.messageRow}>
              <View style={styles.botAvatar}><Bot size={17} color={palette.white} /></View>
              <View style={[styles.typing, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
                <View style={styles.typingDot} /><View style={styles.typingDot} /><View style={styles.typingDot} />
              </View>
            </View>
          ) : null}

          {messages.length <= 1 ? (
            <View style={styles.suggestions}>
              <AtlasText variant="micro" color={theme.colors.textMuted}>TRY ASKING</AtlasText>
              <View style={styles.suggestionGrid}>
                {suggestions.map(({ text, icon: Icon, color }) => (
                  <Pressable
                    key={text}
                    onPress={() => void ask(text)}
                    style={({ pressed }) => [styles.suggestion, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.75 : 1 }]}
                  >
                    <View style={[styles.suggestionIcon, { backgroundColor: `${color}18` }]}><Icon size={17} color={color} /></View>
                    <AtlasText variant="caption" style={styles.flex}>{text}</AtlasText>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View style={[styles.composerWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
          <View style={[styles.composer, shadow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <TextInput
              accessibilityLabel="Ask Atlas Assistant"
              value={input}
              onChangeText={setInput}
              placeholder="Ask about people, trips, or ETA…"
              placeholderTextColor={theme.colors.textMuted}
              multiline
              maxLength={500}
              style={[styles.input, typography.body, { color: theme.colors.text }]}
            />
            <IconButton icon={Send} label="Send question" onPress={() => void ask(input)} size={42} style={{ backgroundColor: input.trim() ? palette.blue : theme.colors.background }} />
          </View>
          <AtlasText variant="micro" color={theme.colors.textMuted} align="center">AI CAN MAKE MISTAKES · VERIFY TIME-SENSITIVE SAFETY INFO</AtlasText>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function demoAnswer(question: string): AssistantResponse {
  const normalized = question.toLowerCase();
  const base = {
    conversationId: '95cabdb8-e141-443e-a92e-93f66677fce9',
    generatedBy: 'DETERMINISTIC' as const,
    dataAsOf: new Date().toISOString(),
  };
  if (normalized.includes('sarah') || normalized.includes('where')) {
    return { ...base, answer: 'Sarah is moving near Victoria Island. Her location updated just now, and she chose to share precise location with you until 6:30 PM.', action: { type: 'OPEN_PERSON', userId: '77bf481a-2060-4e3b-96f0-d8fb50f70b73' }, safetyNotice: null };
  }
  if (normalized.includes('closest')) {
    return { ...base, answer: 'Leo is closest at approximately 2.3 km away. Straight-line distance may differ from driving distance.', action: { type: 'OPEN_PERSON', userId: 'adbe9ec3-d817-48de-99fc-bfb078fe4dc3' }, safetyNotice: 'Distance is approximate.' };
  }
  if (normalized.includes('replay') || normalized.includes('journey')) {
    return { ...base, answer: 'I found yesterday’s main journey: 8.7 km over 34 minutes. It started in Ikoyi and ended on Victoria Island.', action: { type: 'OPEN_TRIP', tripId: '5ecfe467-ff7b-463f-9529-8e8c7df1b897' }, safetyNotice: null };
  }
  return { ...base, answer: 'This week you travelled 42.8 km across 9 recorded trips — 12% more than last week. Saturday was your highest-travel day.', action: { type: 'OPEN_REPORT', period: 'WEEK' }, safetyNotice: 'Totals include recorded trips only.' };
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  aiLogo: { alignItems: 'center', backgroundColor: palette.blue, borderRadius: 15, height: 44, justifyContent: 'center', width: 44 },
  online: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  greenDot: { backgroundColor: palette.green, borderRadius: 4, height: 7, width: 7 },
  secure: { alignItems: 'center', backgroundColor: 'rgba(20,184,166,0.09)', borderRadius: radii.pill, flexDirection: 'row', gap: 5, paddingHorizontal: 8, paddingVertical: 6 },
  messages: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  privacyCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  messageRow: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs, maxWidth: '92%' },
  userMessageRow: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  botAvatar: { alignItems: 'center', backgroundColor: palette.blue, borderRadius: 14, height: 34, justifyContent: 'center', width: 34 },
  bubble: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, gap: spacing.sm, maxWidth: '88%', padding: spacing.md },
  userBubble: { backgroundColor: palette.blue, borderBottomRightRadius: 6, borderWidth: 0 },
  action: { alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', paddingTop: spacing.sm },
  typing: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 5, padding: spacing.md },
  typingDot: { backgroundColor: palette.slate400, borderRadius: 4, height: 7, width: 7 },
  suggestions: { gap: spacing.sm, marginTop: spacing.sm },
  suggestionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  suggestion: { alignItems: 'center', borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.sm, minHeight: 62, padding: spacing.sm, width: '48%' },
  suggestionIcon: { alignItems: 'center', borderRadius: 11, height: 34, justifyContent: 'center', width: 34 },
  composerWrap: { borderTopWidth: StyleSheet.hairlineWidth, gap: 6, padding: spacing.sm },
  composer: { alignItems: 'flex-end', borderRadius: 24, borderWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: spacing.xs, padding: 6, paddingLeft: spacing.md },
  input: { flex: 1, maxHeight: 100, minHeight: 40, paddingTop: 9 },
});
