import { useCallback, useRef, useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  FadeIn,
} from "react-native-reanimated";
import { View, Platform } from "react-native";

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

type TabIconName = keyof typeof Ionicons.glyphMap;

const TAB_CONFIG: {
  name: string;
  title: string;
  icon: TabIconName;
  iconFocused: TabIconName;
}[] = [
  {
    name: "discover",
    title: "Discover",
    icon: "compass-outline",
    iconFocused: "compass",
  },
  {
    name: "copies",
    title: "My Copies",
    icon: "copy-outline",
    iconFocused: "copy",
  },
  {
    name: "portfolio",
    title: "Portfolio",
    icon: "pie-chart-outline",
    iconFocused: "pie-chart",
  },
  {
    name: "activity",
    title: "Activity",
    icon: "pulse-outline",
    iconFocused: "pulse",
  },
  {
    name: "settings",
    title: "Settings",
    icon: "settings-outline",
    iconFocused: "settings",
  },
];

function AnimatedTabIcon({
  name,
  color,
  focused,
}: {
  name: TabIconName;
  color: string;
  focused: boolean;
}) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (focused) {
      scale.value = withTiming(1.15, {
        duration: TRANSITION_DURATION,
        easing: EASE_OUT_EXPO,
      });
    } else {
      scale.value = withTiming(1, {
        duration: TRANSITION_DURATION,
        easing: EASE_OUT_EXPO,
      });
    }
  }, [focused]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Ionicons name={name} size={22} color={color} />
    </Animated.View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#0a0a0a",
          borderTopColor: "#1e1e1e",
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 88 : 64,
          paddingBottom: Platform.OS === "ios" ? 28 : 8,
          paddingTop: 8,
        },
        tabBarActiveTintColor: "#33a5ff",
        tabBarInactiveTintColor: "#6b7280",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      {TAB_CONFIG.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, focused }) => (
              <AnimatedTabIcon
                name={focused ? tab.iconFocused : tab.icon}
                color={color}
                focused={focused}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
