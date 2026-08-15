import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import {
  BatteryMedium,
  ChevronRight,
  MessageCircle,
  Search,
  UserPlus,
  UsersRound,
} from 'lucide-react-native';
import { Avatar } from '@/components/ui/Avatar';
import { AtlasText } from '@/components/ui/AtlasText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Pill } from '@/components/ui/Pill';
import { Screen } from '@/components/ui/Screen';
import { useLocationStore } from '@/features/location/store/location-store';
import type { RootStackParamList } from '@/navigation/types';
import { apiRequest } from '@/shared/api/api-client';
import { palette, radii, spacing, typography } from '@/shared/config/theme';
import { useAppSelector } from '@/shared/hooks/redux';
import { useAtlasTheme } from '@/shared/hooks/use-atlas-theme';

interface FriendApiResponse {
  friends: Array<{
    id: string;
    friend: {
      id: string;
      displayName: string;
      handle: string | null;
      avatarUrl: string | null;
      isOnline: boolean;
    };
  }>;
  incoming: Array<{
    id: string;
    friend: {
      id: string;
      displayName: string;
      handle: string | null;
      avatarUrl: string | null;
      isOnline: boolean;
    };
  }>;
  outgoing: unknown[];
}

export function PeopleScreen() {
  const theme = useAtlasTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const mode = useAppSelector((state) => state.auth.mode);
  const people = useLocationStore((state) => state.people);
  const selectPerson = useLocationStore((state) => state.selectPerson);
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const friendsQuery = useQuery({
    queryKey: ['friends'],
    queryFn: () => apiRequest<FriendApiResponse>('/friends'),
    enabled: mode === 'live',
    staleTime: 30_000,
  });
  const filtered = useMemo(
    () => people.filter((person) => person.name.toLowerCase().includes(query.toLowerCase())),
    [people, query],
  );

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.header}>
        <View>
          <AtlasText variant="h1">Your people</AtlasText>
          <AtlasText color={theme.colors.textMuted}>A private circle you control.</AtlasText>
        </View>
        <IconButton
          icon={UserPlus}
          label="Add a person"
          onPress={() => setShowSearch((value) => !value)}
        />
      </View>

      {showSearch ? (
        <View
          style={[
            styles.search,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Search size={19} color={theme.colors.textMuted} />
          <TextInput
            autoFocus
            accessibilityLabel="Search people"
            placeholder="Search by name or @handle"
            placeholderTextColor={theme.colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={[styles.searchInput, typography.body, { color: theme.colors.text }]}
          />
        </View>
      ) : null}

      <Card elevated style={styles.circleCard}>
        <View style={styles.circleHeader}>
          <View style={styles.circleIcon}>
            <UsersRound size={20} color={palette.blue} />
          </View>
          <View style={styles.flex}>
            <AtlasText variant="h3">Inner circle</AtlasText>
            <AtlasText variant="caption" color={theme.colors.textMuted}>
              {people.length} people · end-to-end protected
            </AtlasText>
          </View>
          <Pill label="PRIVATE" color={palette.teal} backgroundColor="rgba(20,184,166,0.11)" />
        </View>
        <View style={styles.avatarStack}>
          {people.map((person, index) => (
            <View
              key={person.id}
              style={{ marginLeft: index === 0 ? 0 : -10, zIndex: people.length - index }}
            >
              <Avatar name={person.name} color={person.color} size={42} ring />
            </View>
          ))}
          <View style={[styles.addAvatar, { borderColor: theme.colors.border }]}>
            <UserPlus size={17} color={theme.colors.textMuted} />
          </View>
        </View>
      </Card>

      <View style={styles.sectionHeader}>
        <AtlasText variant="h3">Sharing with you</AtlasText>
        <AtlasText variant="caption" color={theme.colors.textMuted}>
          {filtered.length} live now
        </AtlasText>
      </View>
      <View style={styles.list}>
        {filtered.map((person) => (
          <Card key={person.id} style={styles.personRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${person.name} on the map`}
              onPress={() => {
                selectPerson(person.id);
                navigation.navigate('Main');
              }}
              style={styles.personMain}
            >
              <Avatar
                name={person.name}
                color={person.color}
                size={48}
                online={person.status !== 'stale'}
              />
              <View style={styles.personText}>
                <View style={styles.personName}>
                  <AtlasText variant="label">{person.name}</AtlasText>
                  {person.status === 'moving' ? <View style={styles.movingDot} /> : null}
                </View>
                <AtlasText variant="caption" color={theme.colors.textMuted}>
                  {person.statusLabel}
                </AtlasText>
                <AtlasText variant="micro" color={theme.colors.textMuted}>
                  {person.place.toUpperCase()}
                </AtlasText>
              </View>
            </Pressable>
            <View style={styles.personMeta}>
              <View style={styles.battery}>
                <BatteryMedium
                  size={14}
                  color={
                    person.batteryPct && person.batteryPct < 35
                      ? palette.amber
                      : theme.colors.textMuted
                  }
                />
                <AtlasText variant="caption" color={theme.colors.textMuted}>
                  {person.batteryPct}%
                </AtlasText>
              </View>
              <IconButton
                icon={MessageCircle}
                label={`Message ${person.firstName}`}
                onPress={() => navigation.navigate('Chat', { title: person.name })}
                size={36}
                iconSize={17}
              />
            </View>
          </Card>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <AtlasText variant="h3">All friends</AtlasText>
        {friendsQuery.isFetching ? (
          <AtlasText variant="caption" color={theme.colors.textMuted}>
            Syncing…
          </AtlasText>
        ) : null}
      </View>
      <Card padded={false}>
        {people.map((person, index) => (
          <Pressable
            key={person.id}
            style={[
              styles.friendRow,
              index < people.length - 1 && {
                borderBottomColor: theme.colors.border,
                borderBottomWidth: StyleSheet.hairlineWidth,
              },
            ]}
          >
            <Avatar name={person.name} color={person.color} size={40} />
            <View style={styles.flex}>
              <AtlasText variant="label">{person.name}</AtlasText>
              <AtlasText variant="caption" color={theme.colors.textMuted}>
                @{person.firstName.toLowerCase()}
              </AtlasText>
            </View>
            <AtlasText variant="micro" color={palette.teal}>
              TRUSTED
            </AtlasText>
            <ChevronRight size={18} color={theme.colors.textMuted} />
          </Pressable>
        ))}
      </Card>
      <Button
        label="Invite someone you trust"
        icon={UserPlus}
        variant="secondary"
        onPress={() => setShowSearch(true)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingTop: spacing.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  search: {
    alignItems: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 50,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1 },
  circleCard: { gap: spacing.md },
  circleHeader: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  circleIcon: {
    alignItems: 'center',
    backgroundColor: 'rgba(37,99,235,0.1)',
    borderRadius: 13,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  flex: { flex: 1 },
  avatarStack: { alignItems: 'center', flexDirection: 'row' },
  addAvatar: {
    alignItems: 'center',
    borderRadius: 21,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    height: 42,
    justifyContent: 'center',
    marginLeft: -6,
    width: 42,
  },
  sectionHeader: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between' },
  list: { gap: spacing.sm },
  personRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.sm },
  personMain: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: spacing.sm },
  personText: { flex: 1, gap: 1 },
  personName: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  movingDot: { backgroundColor: palette.green, borderRadius: 4, height: 7, width: 7 },
  personMeta: { alignItems: 'flex-end', gap: 5 },
  battery: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  friendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: 66,
    paddingHorizontal: spacing.md,
  },
});
