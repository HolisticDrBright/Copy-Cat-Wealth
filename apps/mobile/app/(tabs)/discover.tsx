import { useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  Layout,
} from "react-native-reanimated";
import { useQuery } from "@tanstack/react-query";
import { SafeAreaView } from "react-native-safe-area-context";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

const FILTER_TABS = ["All", "Stocks", "Crypto", "Forex", "Polymarket"] as const;
type FilterTab = (typeof FILTER_TABS)[number];

const SORT_OPTIONS = ["Top Performers", "Most Copied", "Lowest Risk", "Newest"] as const;

interface Trader {
  id: string;
  name: string;
  avatar: string;
  winRate: number;
  totalReturn: number;
  copiers: number;
  riskScore: number;
  markets: string[];
  monthlyReturn: number;
  description: string;
}

const MOCK_TRADERS: Trader[] = [
  {
    id: "1",
    name: "Alex Morgan",
    avatar: "https://i.pravatar.cc/150?u=alex",
    winRate: 72.4,
    totalReturn: 184.5,
    copiers: 2341,
    riskScore: 3,
    markets: ["Stocks", "Crypto"],
    monthlyReturn: 8.2,
    description: "Momentum & swing trader focused on tech and crypto markets",
  },
  {
    id: "2",
    name: "Sarah Chen",
    avatar: "https://i.pravatar.cc/150?u=sarah",
    winRate: 68.1,
    totalReturn: 142.3,
    copiers: 1856,
    riskScore: 2,
    markets: ["Stocks"],
    monthlyReturn: 5.7,
    description: "Value investor with a focus on dividend aristocrats",
  },
  {
    id: "3",
    name: "Marcus Webb",
    avatar: "https://i.pravatar.cc/150?u=marcus",
    winRate: 65.8,
    totalReturn: 312.1,
    copiers: 3102,
    riskScore: 5,
    markets: ["Crypto"],
    monthlyReturn: 14.3,
    description: "High-conviction DeFi & altcoin specialist",
  },
  {
    id: "4",
    name: "Elena Rodriguez",
    avatar: "https://i.pravatar.cc/150?u=elena",
    winRate: 71.2,
    totalReturn: 98.4,
    copiers: 945,
    riskScore: 2,
    markets: ["Forex"],
    monthlyReturn: 3.8,
    description: "Conservative forex trader, major pairs only",
  },
  {
    id: "5",
    name: "James Park",
    avatar: "https://i.pravatar.cc/150?u=james",
    winRate: 60.5,
    totalReturn: 256.7,
    copiers: 1678,
    riskScore: 4,
    markets: ["Polymarket"],
    monthlyReturn: 11.2,
    description: "Prediction market analyst, political & sports events",
  },
  {
    id: "6",
    name: "Nina Patel",
    avatar: "https://i.pravatar.cc/150?u=nina",
    winRate: 74.9,
    totalReturn: 167.8,
    copiers: 2890,
    riskScore: 3,
    markets: ["Stocks", "Crypto"],
    monthlyReturn: 7.1,
    description: "Quant-driven multi-asset strategy",
  },
  {
    id: "7",
    name: "David Kim",
    avatar: "https://i.pravatar.cc/150?u=david",
    winRate: 69.3,
    totalReturn: 121.5,
    copiers: 1234,
    riskScore: 2,
    markets: ["Stocks"],
    monthlyReturn: 4.9,
    description: "Index-aware stock picker, S&P outperformance focus",
  },
  {
    id: "8",
    name: "Olivia Russo",
    avatar: "https://i.pravatar.cc/150?u=olivia",
    winRate: 63.7,
    totalReturn: 203.9,
    copiers: 1502,
    riskScore: 4,
    markets: ["Crypto", "Polymarket"],
    monthlyReturn: 9.8,
    description: "Cross-market event-driven strategy",
  },
];

function useTraders(filter: FilterTab, searchQuery: string) {
  return useQuery({
    queryKey: ["traders", filter, searchQuery],
    queryFn: async () => {
      // Simulate network delay
      await new Promise((r) => setTimeout(r, 400));
      let filtered = MOCK_TRADERS;
      if (filter !== "All") {
        filtered = filtered.filter((t) => t.markets.includes(filter));
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(
          (t) =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q)
        );
      }
      return filtered;
    },
  });
}

function FilterTabBar({
  active,
  onSelect,
}: {
  active: FilterTab;
  onSelect: (tab: FilterTab) => void;
}) {
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const tabLayouts = useSharedValue<Record<string, { x: number; width: number }>>({});

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const handleLayout = useCallback(
    (tab: FilterTab, x: number, width: number) => {
      tabLayouts.value = { ...tabLayouts.value, [tab]: { x, width } };
      if (tab === active) {
        indicatorX.value = x;
        indicatorWidth.value = width;
      }
    },
    [active]
  );

  const handleSelect = useCallback(
    (tab: FilterTab) => {
      const layout = tabLayouts.value[tab];
      if (layout) {
        indicatorX.value = withTiming(layout.x, {
          duration: TRANSITION_DURATION,
          easing: EASE_OUT_EXPO,
        });
        indicatorWidth.value = withTiming(layout.width, {
          duration: TRANSITION_DURATION,
          easing: EASE_OUT_EXPO,
        });
      }
      onSelect(tab);
    },
    [onSelect]
  );

  return (
    <View className="mb-4">
      <View className="flex-row px-4 relative">
        {FILTER_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            onLayout={(e) => {
              const { x, width } = e.nativeEvent.layout;
              handleLayout(tab, x, width);
            }}
            onPress={() => handleSelect(tab)}
            className="mr-1 px-3 py-2"
          >
            <Text
              className={`text-sm font-semibold ${
                active === tab ? "text-brand-400" : "text-gray-500"
              }`}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View className="px-4 h-0.5 bg-surface-200">
        <Animated.View
          style={indicatorStyle}
          className="h-0.5 bg-brand-400 absolute bottom-0"
        />
      </View>
    </View>
  );
}

function RiskBadge({ score }: { score: number }) {
  const color =
    score <= 2
      ? "bg-green-900/50 text-green-400"
      : score <= 3
      ? "bg-yellow-900/50 text-yellow-400"
      : "bg-red-900/50 text-red-400";
  const label = score <= 2 ? "Low" : score <= 3 ? "Med" : "High";

  return (
    <View className={`px-2 py-0.5 rounded-full ${color.split(" ")[0]}`}>
      <Text className={`text-xs font-semibold ${color.split(" ")[1]}`}>
        Risk: {label}
      </Text>
    </View>
  );
}

function TraderCard({ trader, index }: { trader: Trader; index: number }) {
  const router = useRouter();

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_DURATION)
        .easing(EASE_OUT_EXPO)
        .delay(index * 50)}
      layout={Layout.duration(TRANSITION_DURATION).easing(EASE_OUT_EXPO)}
    >
      <TouchableOpacity
        onPress={() => router.push(`/trader/${trader.id}`)}
        className="mx-4 mb-3 bg-surface-100 rounded-2xl p-4 border border-surface-200"
        activeOpacity={0.7}
      >
        <View className="flex-row items-center mb-3">
          <Image
            source={{ uri: trader.avatar }}
            className="w-12 h-12 rounded-full bg-surface-300"
          />
          <View className="ml-3 flex-1">
            <Text className="text-white font-semibold text-base">
              {trader.name}
            </Text>
            <Text className="text-gray-400 text-xs mt-0.5" numberOfLines={1}>
              {trader.description}
            </Text>
          </View>
          <RiskBadge score={trader.riskScore} />
        </View>

        <View className="flex-row justify-between">
          <View className="items-center flex-1">
            <Text className="text-gray-500 text-xs mb-1">Win Rate</Text>
            <Text className="text-white font-semibold">
              {trader.winRate}%
            </Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-gray-500 text-xs mb-1">Total Return</Text>
            <Text className="text-success font-semibold">
              +{trader.totalReturn}%
            </Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-gray-500 text-xs mb-1">Monthly</Text>
            <Text className="text-success font-semibold">
              +{trader.monthlyReturn}%
            </Text>
          </View>
          <View className="items-center flex-1">
            <Text className="text-gray-500 text-xs mb-1">Copiers</Text>
            <Text className="text-white font-semibold">
              {trader.copiers.toLocaleString()}
            </Text>
          </View>
        </View>

        <View className="flex-row mt-3 gap-1">
          {trader.markets.map((m) => (
            <View
              key={m}
              className="bg-surface-300 px-2.5 py-1 rounded-full"
            >
              <Text className="text-gray-300 text-xs">{m}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function DiscoverScreen() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<string>("Top Performers");
  const [showSort, setShowSort] = useState(false);

  const { data: traders, isLoading, refetch, isRefetching } = useTraders(activeFilter, searchQuery);

  return (
    <SafeAreaView className="flex-1 bg-surface-0" edges={["top"]}>
      {/* Header */}
      <View className="px-4 pt-2 pb-3">
        <Text className="text-white text-2xl font-bold">Discover</Text>
        <Text className="text-gray-400 text-sm mt-1">
          Find top traders to copy
        </Text>
      </View>

      {/* Search Bar */}
      <View className="px-4 mb-4">
        <View className="flex-row items-center bg-surface-200 rounded-xl px-3 py-2.5">
          <Ionicons name="search" size={18} color="#6b7280" />
          <TextInput
            className="flex-1 text-white ml-2 text-sm"
            placeholder="Search traders..."
            placeholderTextColor="#6b7280"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")}>
              <Ionicons name="close-circle" size={18} color="#6b7280" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Sort Dropdown */}
      <View className="px-4 mb-3 flex-row items-center justify-between">
        <FilterTabBar active={activeFilter} onSelect={setActiveFilter} />
      </View>

      <View className="px-4 mb-3 flex-row items-center">
        <TouchableOpacity
          onPress={() => setShowSort(!showSort)}
          className="flex-row items-center bg-surface-200 rounded-lg px-3 py-1.5"
        >
          <Ionicons name="swap-vertical" size={14} color="#9ca3af" />
          <Text className="text-gray-300 text-xs ml-1.5">{sortBy}</Text>
          <Ionicons
            name={showSort ? "chevron-up" : "chevron-down"}
            size={12}
            color="#9ca3af"
            style={{ marginLeft: 4 }}
          />
        </TouchableOpacity>
      </View>

      {showSort && (
        <Animated.View
          entering={FadeInDown.duration(150).easing(EASE_OUT_EXPO)}
          className="mx-4 mb-3 bg-surface-200 rounded-xl border border-surface-300 overflow-hidden"
        >
          {SORT_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => {
                setSortBy(option);
                setShowSort(false);
              }}
              className={`px-4 py-3 border-b border-surface-300 ${
                sortBy === option ? "bg-surface-300" : ""
              }`}
            >
              <Text
                className={`text-sm ${
                  sortBy === option
                    ? "text-brand-400 font-semibold"
                    : "text-gray-300"
                }`}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </Animated.View>
      )}

      {/* Trader List */}
      <FlatList
        data={traders ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <TraderCard trader={item} index={index} />
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
              <Ionicons name="search-outline" size={48} color="#3d3d3d" />
              <Text className="text-gray-500 text-base mt-4 text-center">
                No traders found matching your criteria
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}
