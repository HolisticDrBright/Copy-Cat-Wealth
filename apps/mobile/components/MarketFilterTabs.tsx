import { useCallback, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  Layout,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useMarketFilterStore } from "../lib/store";
import type { MarketType } from "@copy-cat/shared";

const TRANSITION_CONFIG = {
  duration: 250,
  easing: Easing.bezier(0.19, 1, 0.22, 1),
};

type FilterKey = MarketType | "all" | "polymarket";

interface FilterTabDef {
  key: FilterKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const FILTER_TABS: FilterTabDef[] = [
  { key: "all", label: "All", icon: "grid-outline" },
  { key: "stocks", label: "Stocks", icon: "trending-up-outline" },
  { key: "crypto", label: "Crypto", icon: "logo-bitcoin" },
  { key: "forex", label: "Forex", icon: "swap-horizontal-outline" },
  { key: "polymarket", label: "Polymarket", icon: "analytics-outline" },
];

interface MarketFilterTabsProps {
  /** Override the store-based market if needed */
  activeMarket?: FilterKey;
  onSelect?: (market: FilterKey) => void;
}

export function MarketFilterTabs({
  activeMarket: controlledMarket,
  onSelect: controlledOnSelect,
}: MarketFilterTabsProps = {}) {
  const { activeMarket: storeMarket, setActiveMarket } =
    useMarketFilterStore();

  const active = controlledMarket ?? storeMarket;
  const onSelect = controlledOnSelect ?? (setActiveMarket as (m: FilterKey) => void);

  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const tabLayouts = useRef<Record<string, { x: number; width: number }>>({});

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorWidth.value,
  }));

  const handleLayout = useCallback(
    (key: FilterKey, x: number, width: number) => {
      tabLayouts.current[key] = { x, width };
      if (key === active) {
        indicatorX.value = x;
        indicatorWidth.value = width;
      }
    },
    [active]
  );

  const handleSelect = useCallback(
    (key: FilterKey) => {
      const layout = tabLayouts.current[key];
      if (layout) {
        indicatorX.value = withTiming(layout.x, TRANSITION_CONFIG);
        indicatorWidth.value = withTiming(layout.width, TRANSITION_CONFIG);
      }
      onSelect(key);
    },
    [onSelect]
  );

  return (
    <Animated.View
      entering={FadeInDown.duration(TRANSITION_CONFIG.duration).easing(
        TRANSITION_CONFIG.easing
      )}
      layout={Layout.duration(TRANSITION_CONFIG.duration).easing(
        TRANSITION_CONFIG.easing
      )}
      className="mb-4"
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      >
        <View className="relative">
          <View className="flex-row">
            {FILTER_TABS.map((tab) => {
              const isActive = active === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  onLayout={(e) => {
                    const { x, width } = e.nativeEvent.layout;
                    handleLayout(tab.key, x, width);
                  }}
                  onPress={() => handleSelect(tab.key)}
                  className="mr-1 flex-row items-center px-3 py-2"
                >
                  <Ionicons
                    name={tab.icon}
                    size={14}
                    color={isActive ? "#33a5ff" : "#6b7280"}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    className={`text-sm font-semibold ${
                      isActive ? "text-brand-400" : "text-neutral-500"
                    }`}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Animated underline */}
          <View className="h-0.5 bg-surface-200">
            <Animated.View
              style={indicatorStyle}
              className="absolute bottom-0 h-0.5 rounded-full bg-brand-400"
            />
          </View>
        </View>
      </ScrollView>
    </Animated.View>
  );
}
