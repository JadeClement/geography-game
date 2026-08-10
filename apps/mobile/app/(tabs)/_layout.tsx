import { Tabs } from "expo-router";
import { Text } from "react-native";
import { Colors } from "../../constants/theme";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Play: "🌍",
    Learn: "📘",
    Friends: "👥",
    Map: "🗺️",
  };
  return (
    <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.55 }}>
      {icons[label] || "•"}
    </Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.background.primary,
          borderTopColor: Colors.border.subtle,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: Colors.brand.teal,
        tabBarInactiveTintColor: Colors.text.tertiary,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Play",
          tabBarIcon: ({ focused }) => <TabIcon label="Play" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: "Learn",
          tabBarIcon: ({ focused }) => <TabIcon label="Learn" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          title: "Friends",
          tabBarIcon: ({ focused }) => (
            <TabIcon label="Friends" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="mastery"
        options={{
          title: "Map",
          tabBarIcon: ({ focused }) => <TabIcon label="Map" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
