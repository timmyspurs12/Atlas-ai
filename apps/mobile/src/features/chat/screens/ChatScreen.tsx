import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import {
  ArrowLeft,
  CheckCheck,
  Image as ImageIcon,
  MapPin,
  Mic,
  MoreHorizontal,
  Phone,
  Send,
} from 'lucide-react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Avatar } from '@/components/ui/Avatar';
import { AtlasText } from '@/components/ui/AtlasText';
import { IconButton } from '@/components/ui/IconButton';
import type { RootStackParamList } from '@/navigation/types';
import { apiRequest } from '@/shared/api/api-client';
import { palette, spacing, typography } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface Message {
  id: string;
  text: string;
  mine: boolean;
  time: string;
  type?: 'text' | 'location' | 'image' | 'voice';
  imageUri?: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Chat'>;

export function ChatScreen({ navigation, route }: Props) {
  const theme = useAtlasTheme();
  const mode = useAppSelector((state) => state.auth.mode);
  const title = route.params?.title ?? 'Sarah Chen';
  const conversationId = route.params?.conversationId;
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);
  const [text, setText] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', text: 'Made it to Victoria Island safely.', mine: false, time: '3:28 PM' },
    {
      id: '2',
      text: 'Perfect — I can see you’re close. See you soon!',
      mine: true,
      time: '3:29 PM',
    },
    { id: '3', text: 'About 12 minutes away now.', mine: false, time: '3:41 PM' },
  ]);
  const scrollRef = useRef<ScrollView>(null);

  const send = async (
    body: string,
    type: 'TEXT' | 'LOCATION' | 'IMAGE' | 'VOICE' = 'TEXT',
  ): Promise<void> => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const local: Message = {
      id: Crypto.randomUUID(),
      text: type === 'LOCATION' ? 'Shared a current location' : trimmed,
      mine: true,
      time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      type:
        type === 'LOCATION'
          ? 'location'
          : type === 'IMAGE'
            ? 'image'
            : type === 'VOICE'
              ? 'voice'
              : 'text',
    };
    setMessages((current) => [...current, local]);
    setText('');
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
    if (mode === 'live' && conversationId) {
      await apiRequest(`/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: { clientMessageId: local.id, type, body: trimmed },
      });
    }
  };

  const shareLocation = async (): Promise<void> => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return;
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    await send(
      JSON.stringify({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracyM: location.coords.accuracy,
        sharedAt: new Date().toISOString(),
      }),
      'LOCATION',
    );
  };

  const toggleVoiceNote = async (): Promise<void> => {
    if (recorderState.isRecording) {
      await audioRecorder.stop();
      const uri = audioRecorder.uri;
      if (uri) {
        await send(
          JSON.stringify({
            uri,
            durationMs: recorderState.durationMillis,
            recordedAt: new Date().toISOString(),
          }),
          'VOICE',
        );
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      return;
    }
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) return;
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
  };

  const chooseImage = async (): Promise<void> => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.82,
    });
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    if (mode === 'live' && conversationId) {
      await send(
        JSON.stringify({ localUri: asset.uri, width: asset.width, height: asset.height }),
        'IMAGE',
      );
    } else {
      setMessages((current) => [
        ...current,
        {
          id: Crypto.randomUUID(),
          text: 'Encrypted photo',
          mine: true,
          time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          type: 'image',
          imageUri: asset.uri,
        },
      ]);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: theme.colors.background }]}
      edges={['top', 'bottom']}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.header,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <IconButton icon={ArrowLeft} label="Back" onPress={() => navigation.goBack()} size={40} />
          <Avatar name={title} color="#8B5CF6" size={42} online />
          <View style={styles.headerCopy}>
            <AtlasText variant="label">{title}</AtlasText>
            <AtlasText variant="caption" color={palette.green}>
              Online · sharing live
            </AtlasText>
          </View>
          <IconButton icon={Phone} label={`Call ${title}`} onPress={() => undefined} size={38} />
          <IconButton
            icon={MoreHorizontal}
            label="Conversation settings"
            onPress={() => undefined}
            size={38}
          />
        </View>

        <ScrollView ref={scrollRef} style={styles.flex} contentContainerStyle={styles.messages}>
          <View style={styles.encryption}>
            <AtlasText variant="micro" color={theme.colors.textMuted}>
              🔒 MESSAGES ARE ENCRYPTED AT REST AND IN TRANSIT
            </AtlasText>
          </View>
          {messages.map((message) => (
            <View
              key={message.id}
              style={[styles.message, message.mine ? styles.mine : styles.theirs]}
            >
              <View
                style={[
                  styles.bubble,
                  message.mine
                    ? styles.mineBubble
                    : { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
                ]}
              >
                {message.type === 'location' ? (
                  <View style={styles.locationCard}>
                    <View style={styles.locationIcon}>
                      <MapPin size={21} color={palette.white} />
                    </View>
                    <View>
                      <AtlasText
                        variant="label"
                        color={message.mine ? palette.white : theme.colors.text}
                      >
                        Current location
                      </AtlasText>
                      <AtlasText
                        variant="caption"
                        color={message.mine ? '#DBEAFE' : theme.colors.textMuted}
                      >
                        Tap to open on the map
                      </AtlasText>
                    </View>
                  </View>
                ) : message.type === 'image' ? (
                  <View style={styles.imageMessage}>
                    <ImageIcon size={32} color={message.mine ? palette.white : palette.blue} />
                    <AtlasText color={message.mine ? palette.white : theme.colors.text}>
                      {message.text}
                    </AtlasText>
                  </View>
                ) : message.type === 'voice' ? (
                  <View style={styles.locationCard}>
                    <View style={styles.locationIcon}>
                      <Mic size={20} color={palette.white} />
                    </View>
                    <View>
                      <AtlasText
                        variant="label"
                        color={message.mine ? palette.white : theme.colors.text}
                      >
                        Voice note
                      </AtlasText>
                      <AtlasText
                        variant="caption"
                        color={message.mine ? '#DBEAFE' : theme.colors.textMuted}
                      >
                        Tap to play securely
                      </AtlasText>
                    </View>
                  </View>
                ) : (
                  <AtlasText color={message.mine ? palette.white : theme.colors.text}>
                    {message.text}
                  </AtlasText>
                )}
                <View style={styles.messageMeta}>
                  <AtlasText
                    variant="micro"
                    color={message.mine ? '#BFDBFE' : theme.colors.textMuted}
                  >
                    {message.time.toUpperCase()}
                  </AtlasText>
                  {message.mine ? <CheckCheck size={13} color="#BFDBFE" /> : null}
                </View>
              </View>
            </View>
          ))}
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            Sarah is typing…
          </AtlasText>
        </ScrollView>

        <View
          style={[
            styles.composerArea,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <View style={styles.tools}>
            <IconButton
              icon={ImageIcon}
              label="Share an image"
              onPress={() => void chooseImage()}
              size={38}
            />
            <IconButton
              icon={MapPin}
              label="Share current location"
              onPress={() => void shareLocation()}
              size={38}
            />
            <IconButton
              icon={Mic}
              label={recorderState.isRecording ? 'Stop and send voice note' : 'Record a voice note'}
              onPress={() => void toggleVoiceNote()}
              size={38}
              danger={recorderState.isRecording}
            />
          </View>
          <View
            style={[
              styles.composer,
              { backgroundColor: theme.colors.background, borderColor: theme.colors.border },
            ]}
          >
            <TextInput
              accessibilityLabel="Message"
              placeholder="Message…"
              placeholderTextColor={theme.colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              style={[styles.input, typography.body, { color: theme.colors.text }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send message"
              onPress={() => void send(text)}
              style={[styles.send, { opacity: text.trim() ? 1 : 0.45 }]}
            >
              <Send size={18} color={palette.white} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  headerCopy: { flex: 1 },
  messages: { gap: spacing.sm, padding: spacing.md },
  encryption: { alignItems: 'center', paddingVertical: spacing.sm },
  message: { maxWidth: '83%' },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start' },
  bubble: {
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mineBubble: { backgroundColor: palette.blue, borderBottomRightRadius: 5, borderWidth: 0 },
  messageMeta: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 3 },
  locationCard: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  locationIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  imageMessage: {
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 150,
    paddingVertical: spacing.sm,
  },
  composerArea: { borderTopWidth: StyleSheet.hairlineWidth, gap: spacing.xs, padding: spacing.sm },
  tools: { flexDirection: 'row', gap: spacing.xs },
  composer: {
    alignItems: 'flex-end',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 5,
    paddingLeft: spacing.md,
  },
  input: { flex: 1, maxHeight: 90, minHeight: 38, paddingTop: 8 },
  send: {
    alignItems: 'center',
    backgroundColor: palette.blue,
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
});
