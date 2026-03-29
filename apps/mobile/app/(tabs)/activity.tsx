import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  Easing,
  Layout,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

const FILTER_CHIPS = ["All", "Trades", "Copies", "Alerts", "System"] as const;
type FilterChip = (typeof FILTER_CHIPS)[number];

type ActivityType =
  | "trade_executed"
  | "copy_started"
  | "copy_paused"
  | "copy_stopped"
  | "stop_loss_hit"
  | "deposit"
  | "withdrawal"
  | "alert"
  | "system";

interface ActivityItem {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    symbol?: string;
    amount?: number;
    traderName?: string;
    pnl?: number;
  };
}

const ACTIVITY_ICON_MAP: Record<
  ActivityType,
  { name: keyof typeof Ionicons.glyphMap; color: string; bg: string }
> = {
  trade_executed: {
    name: "swap-horizontal",
    color: "#33a5ff",
    bg: "bg-blue-600/20",
  },
  copy_started: { name: "play", color: "#22c55e", bg: "bg-green-600/20" },
  copy_paused: { name: "pause", color: "#f59e0b", bg: "bg-yellow-600/20" },
  copy_stopped: { name: "stop", color: "#ef4444", bg: "bg-red-600/20" },
  stop_loss_hit: {
    name: "shield-outline",
    color: "#ef4444",
    bg: "bg-red-600/20",
  },
  deposit: {
    name: "arrow-down-circle",
    color: "#22c55e",
    bg: "bg-green-600/20",
  },
  withdrawal: {
    name: "arrow-up-circle",
    color: "#f59e0b",
    bg: "bg-yellow-600/20",
  },
  alert: {
    name: "notifications",
    color: "#f59e0b",
    bg: "bg-yellow-600/20",
  },
  system: {
    name: "information-circle",
    color: "#9ca3af",
    bg: "bg-gray-600/20",
  },
};

const MOCK_ACTIVITY: ActivityItem[] = [
  {
    id: "a1",
    type: "trade_executed",
    title: "Buy AAPL",
    description: "Copied from Alex Morgan - 5 shares @ $193.40",
    timestamp: "2 min ago",
    metadata: { symbol: "AAPL", amount: 967, traderName: "Alex Morgan" },
  },
  {
    id: "a2",
    type: "trade_executed",
    title: "Sell ETH",
    description: "Copied from Marcus Webb - 0.5 ETH @ $3,045.00",
    timestamp: "15 min ago",
    metadata: { symbol: "ETH", amount: 1522.5, traderName: "Marcus Webb" },
  },
  {
    id: "a3",
    type: "alert",
    title: "Price Alert: BTC",
    description: "Bitcoin crossed above $67,000",
    timestamp: "32 min ago",
    metadata: { symbol: "BTC" },
  },
  {
    id: "a4",
    type: "copy_started",
    title: "Started copying Nina Patel",
    description: "Quant Multi-Asset portfolio - $3,000 allocation",
    timestamp: "1 hr ago",
    metadata: { traderName: "Nina Patel", amount: 3000 },
  },
  {
    id: "a5",
    type: "trade_executed",
    title: "Buy NVDA",
    description: "Copied from Nina Patel - 3 shares @ $918.50",
    timestamp: "1 hr ago",
    metadata: { symbol: "NVDA", amount: 2755.5, traderName: "Nina Patel" },
  },
  {
    id: "a6",
    type: "stop_loss_hit",
    title: "Stop Loss Triggered",
    description: "DeFi Degen Plays reached -25% stop loss threshold",
    timestamp: "2 hr ago",
    metadata: { traderName: "Marcus Webb", pnl: -500 },
  },
  {
    id: "a7",
    type: "copy_paused",
    title: "Paused: Conservative FX",
    description: "Copy of Elena Rodriguez paused manually",
    timestamp: "3 hr ago",
    metadata: { traderName: "Elena Rodriguez" },
  },
  {
    id: "a8",
    type: "trade_executed",
    title: "Buy BTC",
    description: "Copied from Marcus Webb - 0.05 BTC @ $67,200",
    timestamp: "3 hr ago",
    metadata: { symbol: "BTC", amount: 3360, traderName: "Marcus Webb" },
  },
  {
    id: "a9",
    type: "deposit",
    title: "Deposit Received",
    description: "$5,000 deposited via Alpaca",
    timestamp: "5 hr ago",
    metadata: { amount: 5000 },
  },
  {
    id: "a10",
    type: "system",
    title: "Broker Connected",
    description: "Alpaca brokerage account linked successfully",
    timestamp: "5 hr ago",
  },
  {
    id: "a11",
    type: "trade_executed",
    title: "Sell EUR/USD",
    description: "Copied from Elena Rodriguez - 5,000 units @ 1.0878",
    timestamp: "6 hr ago",
    metadata: {
      symbol: "EUR/USD",
      amount: 5439,
      traderName: "Elena Rodriguez",
    },
  },
  {
    id: "a12",
    type: "alert",
    title: "Trader Alert",
    description: "Alex Morgan win rate dropped below 70%",
    timestamp: "1 day ago",
    metadata: { traderName: "Alex Morgan" },
  },
];

function getFilterCategory(type: ActivityType): FilterChip {
  switch (type) {
    case "trade_executed":
      return "Trades";
    case "copy_started":
    case "copy_paused":
    case "copy_stopped":
    case "stop_loss_hit":
      return "Copies";
    case "alert":
      return "Alerts";
    case "deposit":
    case "withdrawal":
    case "system":
      return "System";
    default:
      return "All";
  }
}

function useActivity(filter: FilterChip) {
  return useQuery({
    queryKey: ["activity", filter],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, 300));
      if (filter === "All") return MOCK_ACTIVITY;
      return MOCK_ACTIVITY.filter(
        (item) => getFilterCategory(item.type) === filter
      );
    },
  });
}

function FilterChipBar({
  active,
  onSelect,
}: {
  active: FilterChip;
  onSelect: (chip: FilterChip) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="px-4 mb-4"
      contentContainerStyle={{ gap: 8 }}
    >
      {FILTER_CHIPS.map((chip) => {
        const isActive = chip === active;
        return (
          <Animated.View
            key={chip}
            layout={Layout.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
          >
            <TouchableOpacity
              onPress={() => onSelect(chip)}
              className={`px-4 py-2 rounded-full ${
                isActive
                  ? "bg-brand-500"
                  : "bg-surface-200 border border-surface-300"
              }`}
            >
              <Text
                className={`text-sm font-semibold ${
                  isActive ? "text-white" : "text-gray-400"
                }`}
              >
                {chip}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </ScrollView>
  );
}

function ActivityRow({
  item,
  index,
}: {
  item: ActivityItem;
  index: number;
}) {
  const iconConfig = ACTIVITY_ICON_MAP[item.type];

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(index * 50)}
      layout={Layout.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
      className="flex-row items-start px-4 py-3"
    >
      <View
        className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${iconConfig.bg}`}
      >
        <Ionicons
          name={iconConfig.name}
          size={18}
          color={iconConfig.color}
        />
      </View>
      <View className="flex-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-white font-semibold text-sm flex-1 mr-2">
            {item.title}
          </Text>
          <Text className="text-gray-600 text-xs">{item.timestamp}</Text>
        </View>
        <Text className="text-gray-400 text-xs mt-0.5">
          {item.description}
        </Text>
        {item.metadata?.pnl !== undefined && (
          <Text
            className={`text-xs font-medium mt-1 ${
              item.metadata.pnl >= 0 ? "text-success" : "text-danger"
            }`}
          >
            {item.metadata.pnl >= 0 ? "+" : ""}$
            {Math.abs(item.metadata.pnl).toLocaleString()}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

export default function ActivityScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterChip>("All");
  const {
    data: activities,
    isLoading,
    refetch,
    isRefetching,
  } = useActivity(activeFilter);

  return (
    <SafeAreaView className="flex-1 bg-surface-0" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="text-white text-2xl font-bold">Activity</Text>
        <Text className="text-gray-400 text-sm mt-1">
          Your recent trading activity
        </Text>
      </View>

      {/* Filter Chips */}
      <FilterChipBar active={activeFilter} onSelect={setActiveFilter} />

      {/* Activity List */}
      <FlatList
        data={activities ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ActivityRow item={item} index={index} />
        )}
        ItemSeparatorComponent={() => (
          <View className="h-px bg-surface-200 ml-16" />
        )}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#33a5ff"
          />
        }
        contentContainerStyle={{ paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          !isLoading ? (
            <View className="items-center mt-16 px-8">
              <Ionicons name="pulse-outline" size={48} color="#3d3d3d" />
              <Text className="text-gray-500 text-base mt-4 text-center">
                No activity yet
              </Text>
              <Text className="text-gray-600 text-sm mt-2 text-center">
                Start copying traders to see activity here
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
