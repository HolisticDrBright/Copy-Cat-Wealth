import { useEffect } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Easing } from "react-native-reanimated";
import * as Linking from "expo-linking";
import { api } from "../lib/api";
import "../global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

const TRANSITION_DURATION = 250;
const EASE_OUT_EXPO = Easing.bezier(0.19, 1, 0.22, 1);

const slideFromRight = ({ current, next, layouts }: any) => {
  return {
    cardStyle: {
      transform: [
        {
          translateX: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.width, 0],
          }),
        },
      ],
      opacity: current.progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.3, 0.8, 1],
      }),
    },
    overlayStyle: {
      opacity: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.5],
      }),
    },
  };
};

const slideFromBottom = ({ current, layouts }: any) => {
  return {
    cardStyle: {
      transform: [
        {
          translateY: current.progress.interpolate({
            inputRange: [0, 1],
            outputRange: [layouts.screen.height, 0],
          }),
        },
      ],
      opacity: current.progress.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.5, 0.9, 1],
      }),
    },
  };
};

export default function RootLayout() {
  const router = useRouter();
  const url = Linking.useURL();

  useEffect(() => {
    if (!url) return;

    const handleBrokerCallback = async (broker: string) => {
      const { queryParams } = Linking.parse(url);
      if (!queryParams?.code || !queryParams?.state) return;

      try {
        await api.post(`/api/brokers/${broker}/callback`, {
          code: queryParams.code,
          state: queryParams.state,
        });
        router.replace("/(tabs)/settings");
      } catch (error) {
        console.error(`${broker} OAuth callback failed:`, error);
      }
    };

    if (url.includes("broker-callback/alpaca")) {
      handleBrokerCallback("alpaca");
    } else if (url.includes("broker-callback/coinbase")) {
      handleBrokerCallback("coinbase");
    }
  }, [url]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            gestureDirection: "horizontal",
            animation: "slide_from_right",
            transitionSpec: {
              open: {
                animation: "timing",
                config: {
                  duration: TRANSITION_DURATION,
                  easing: EASE_OUT_EXPO,
                },
              },
              close: {
                animation: "timing",
                config: {
                  duration: TRANSITION_DURATION,
                  easing: EASE_OUT_EXPO,
                },
              },
            },
            cardStyleInterpolator: slideFromRight,
            contentStyle: { backgroundColor: "#000000" },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="trader/[id]"
            options={{
              headerShown: false,
              cardStyleInterpolator: slideFromRight,
            }}
          />
          <Stack.Screen
            name="copy-setup/[portfolioId]"
            options={{
              headerShown: false,
              presentation: "modal",
              gestureDirection: "vertical",
              cardStyleInterpolator: slideFromBottom,
            }}
          />
          <Stack.Screen
            name="broker-connect/[broker]"
            options={{
              headerShown: false,
              cardStyleInterpolator: slideFromRight,
            }}
          />
        </Stack>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}
