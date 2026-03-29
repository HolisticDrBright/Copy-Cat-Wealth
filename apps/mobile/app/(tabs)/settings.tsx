import { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  Easing,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

interface BrokerConnection {
  id: string;
  name: string;
  status: "connected" | "disconnected" | "error";
  accountType: string;
  lastSync: string;
}

const MOCK_BROKERS: BrokerConnection[] = [
  {
    id: "b1",
    name: "Alpaca",
    status: "connected",
    accountType: "Margin",
    lastSync: "Just now",
  },
  {
    id: "b2",
    name: "Coinbase",
    status: "connected",
    accountType: "Spot",
    lastSync: "2 min ago",
  },
  {
    id: "b3",
    name: "OANDA",
    status: "disconnected",
    accountType: "Standard",
    lastSync: "Never",
  },
];

const AVAILABLE_BROKERS = [
  { id: "alpaca", name: "Alpaca", description: "US Stocks & ETFs" },
  { id: "coinbase", name: "Coinbase", description: "Crypto Trading" },
  { id: "oanda", name: "OANDA", description: "Forex Trading" },
  { id: "interactive-brokers", name: "Interactive Brokers", description: "Multi-Asset" },
  { id: "polymarket", name: "Polymarket", description: "Prediction Markets" },
];

function ExpandableSection({
  title,
  icon,
  children,
  index,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: React.ReactNode;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const rotation = useSharedValue(0);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const toggleExpand = () => {
    rotation.value = withTiming(expanded ? 0 : 180, {
      duration: TRANSITION_DURATION,
      easing: EASE_OUT_EXPO,
    });
    setExpanded(!expanded);
  };

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(index * 50)}
      layout={Layout.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
      className="mx-4 mb-3 bg-surface-100 rounded-2xl border border-surface-200 overflow-hidden"
    >
      <TouchableOpacity
        onPress={toggleExpand}
        className="flex-row items-center p-4"
        activeOpacity={0.7}
      >
        <View className="w-8 h-8 bg-surface-300 rounded-full items-center justify-center mr-3">
          <Ionicons name={icon} size={16} color="#9ca3af" />
        </View>
        <Text className="text-white font-semibold text-base flex-1">
          {title}
        </Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={18} color="#6b7280" />
        </Animated.View>
      </TouchableOpacity>

      {expanded && (
        <Animated.View
          layout={Layout.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
          className="px-4 pb-4 border-t border-surface-200 pt-3"
        >
          {children}
        </Animated.View>
      )}
    </Animated.View>
  );
}

function SettingsRow({
  label,
  value,
  onPress,
  hasArrow = true,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  hasArrow?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      className="flex-row items-center justify-between py-3"
      activeOpacity={0.7}
    >
      <Text className="text-gray-300 text-sm">{label}</Text>
      <View className="flex-row items-center">
        {value && (
          <Text className="text-gray-500 text-sm mr-2">{value}</Text>
        )}
        {hasArrow && onPress && (
          <Ionicons name="chevron-forward" size={16} color="#6b7280" />
        )}
      </View>
    </TouchableOpacity>
  );
}

function NotificationToggle({
  label,
  description,
  defaultValue,
}: {
  label: string;
  description: string;
  defaultValue: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultValue);

  return (
    <View className="flex-row items-center justify-between py-3">
      <View className="flex-1 mr-4">
        <Text className="text-gray-300 text-sm">{label}</Text>
        <Text className="text-gray-600 text-xs mt-0.5">{description}</Text>
      </View>
      <Switch
        value={enabled}
        onValueChange={setEnabled}
        trackColor={{ false: "#3d3d3d", true: "#33a5ff" }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

function BrokerStatusBadge({
  status,
}: {
  status: BrokerConnection["status"];
}) {
  const config = {
    connected: { label: "Connected", color: "text-success", bg: "bg-green-900/30" },
    disconnected: { label: "Disconnected", color: "text-gray-400", bg: "bg-gray-800/50" },
    error: { label: "Error", color: "text-danger", bg: "bg-red-900/30" },
  }[status];

  return (
    <View className={`px-2 py-0.5 rounded-full ${config.bg}`}>
      <Text className={`text-xs font-medium ${config.color}`}>
        {config.label}
      </Text>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView className="flex-1 bg-surface-0" edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View className="px-4 pt-2 pb-4">
          <Text className="text-white text-2xl font-bold">Settings</Text>
          <Text className="text-gray-400 text-sm mt-1">
            Manage your account & preferences
          </Text>
        </View>

        {/* Connected Brokers */}
        <ExpandableSection
          title="Connected Brokers"
          icon="link-outline"
          index={0}
        >
          {MOCK_BROKERS.map((broker, i) => (
            <View
              key={broker.id}
              className={`flex-row items-center justify-between py-3 ${
                i < MOCK_BROKERS.length - 1 ? "border-b border-surface-300" : ""
              }`}
            >
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-white font-medium text-sm">
                    {broker.name}
                  </Text>
                  <BrokerStatusBadge status={broker.status} />
                </View>
                <Text className="text-gray-500 text-xs mt-0.5">
                  {broker.accountType} - Last sync: {broker.lastSync}
                </Text>
              </View>
              {broker.status === "disconnected" ? (
                <TouchableOpacity
                  onPress={() =>
                    router.push(
                      `/broker-connect/${broker.name.toLowerCase()}`
                    )
                  }
                  className="bg-brand-500 px-3 py-1.5 rounded-lg"
                >
                  <Text className="text-white text-xs font-semibold">
                    Connect
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity className="px-3 py-1.5">
                  <Ionicons
                    name="ellipsis-horizontal"
                    size={16}
                    color="#6b7280"
                  />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <TouchableOpacity
            onPress={() => router.push("/broker-connect/new")}
            className="flex-row items-center justify-center mt-3 py-2 border border-dashed border-surface-400 rounded-xl"
          >
            <Ionicons name="add" size={16} color="#33a5ff" />
            <Text className="text-brand-400 text-sm font-medium ml-1">
              Add Broker
            </Text>
          </TouchableOpacity>
        </ExpandableSection>

        {/* Notifications */}
        <ExpandableSection
          title="Notifications"
          icon="notifications-outline"
          index={1}
        >
          <NotificationToggle
            label="Trade Executions"
            description="Get notified when a copied trade is executed"
            defaultValue={true}
          />
          <View className="h-px bg-surface-300" />
          <NotificationToggle
            label="Price Alerts"
            description="Alerts when positions hit target prices"
            defaultValue={true}
          />
          <View className="h-px bg-surface-300" />
          <NotificationToggle
            label="Stop Loss Alerts"
            description="Immediate notification when stop loss triggers"
            defaultValue={true}
          />
          <View className="h-px bg-surface-300" />
          <NotificationToggle
            label="Trader Updates"
            description="When traders you copy change their strategy"
            defaultValue={false}
          />
          <View className="h-px bg-surface-300" />
          <NotificationToggle
            label="Weekly Summary"
            description="Weekly portfolio performance digest"
            defaultValue={true}
          />
        </ExpandableSection>

        {/* Subscription */}
        <ExpandableSection
          title="Subscription"
          icon="diamond-outline"
          index={2}
        >
          <View className="bg-surface-300/50 rounded-xl p-4 mb-3">
            <View className="flex-row items-center justify-between">
              <View>
                <Text className="text-brand-400 font-bold text-lg">
                  Pro Plan
                </Text>
                <Text className="text-gray-400 text-xs mt-0.5">
                  $29.99/month
                </Text>
              </View>
              <View className="bg-brand-500/20 px-3 py-1 rounded-full">
                <Text className="text-brand-400 text-xs font-semibold">
                  Active
                </Text>
              </View>
            </View>
            <View className="mt-3 gap-2">
              <View className="flex-row items-center">
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#22c55e"
                />
                <Text className="text-gray-300 text-xs ml-2">
                  Unlimited copy subscriptions
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#22c55e"
                />
                <Text className="text-gray-300 text-xs ml-2">
                  Real-time trade execution
                </Text>
              </View>
              <View className="flex-row items-center">
                <Ionicons
                  name="checkmark-circle"
                  size={14}
                  color="#22c55e"
                />
                <Text className="text-gray-300 text-xs ml-2">
                  Advanced analytics & risk tools
                </Text>
              </View>
            </View>
          </View>
          <SettingsRow
            label="Manage Subscription"
            onPress={() => {}}
          />
          <View className="h-px bg-surface-300" />
          <SettingsRow
            label="Billing History"
            onPress={() => {}}
          />
        </ExpandableSection>

        {/* Legal */}
        <ExpandableSection
          title="Legal & Support"
          icon="document-text-outline"
          index={3}
        >
          <SettingsRow label="Terms of Service" onPress={() => {}} />
          <View className="h-px bg-surface-300" />
          <SettingsRow label="Privacy Policy" onPress={() => {}} />
          <View className="h-px bg-surface-300" />
          <SettingsRow label="Risk Disclosure" onPress={() => {}} />
          <View className="h-px bg-surface-300" />
          <SettingsRow label="Help Center" onPress={() => {}} />
          <View className="h-px bg-surface-300" />
          <SettingsRow label="Contact Support" onPress={() => {}} />
          <View className="h-px bg-surface-300" />
          <SettingsRow
            label="App Version"
            value="1.0.0 (42)"
            hasArrow={false}
          />
        </ExpandableSection>

        {/* Danger Zone */}
        <Animated.View
          entering={FadeInDown.duration(TRANSITION_DURATION)
            .easing(EASE_OUT_EXPO)
            .delay(4 * 50)}
          className="mx-4 mb-3 bg-surface-100 rounded-2xl border border-surface-200 overflow-hidden"
        >
          <TouchableOpacity
            onPress={() =>
              Alert.alert(
                "Sign Out",
                "Are you sure you want to sign out?",
                [
                  { text: "Cancel", style: "cancel" },
                  { text: "Sign Out", style: "destructive" },
                ]
              )
            }
            className="flex-row items-center p-4"
            activeOpacity={0.7}
          >
            <View className="w-8 h-8 bg-red-900/30 rounded-full items-center justify-center mr-3">
              <Ionicons name="log-out-outline" size={16} color="#ef4444" />
            </View>
            <Text className="text-danger font-semibold text-base">
              Sign Out
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <View className="h-12" />
      </ScrollView>
    </SafeAreaView>
  );
}
