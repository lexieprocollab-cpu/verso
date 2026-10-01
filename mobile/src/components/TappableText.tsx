import { tokenize } from "@shared/lib/song";
import { Text, type StyleProp, type TextStyle } from "react-native";

/** Text whose words can be tapped (only words in `isKnown`, when given). */
export function TappableText({
  text,
  onWord,
  isKnown,
  style,
}: {
  text: string;
  onWord: (key: string, word: string) => void;
  isKnown?: (key: string) => boolean;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={style}>
      {tokenize(text).map((token, i) =>
        token.isWord && (!isKnown || isKnown(token.key)) ? (
          <Text key={i} accessibilityRole="button" onPress={() => onWord(token.key, token.text)} style={{ textDecorationLine: "underline", textDecorationStyle: "dotted" }}>
            {token.text}
          </Text>
        ) : (
          token.text
        ),
      )}
    </Text>
  );
}
