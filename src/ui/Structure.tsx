import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";

import { depict } from "../chem/api";
import { theme } from "./theme";

/**
 * 一个结构或一条反应的图。
 *
 * SVG 由 RDKit 生成，用 react-native-svg 直接渲染，不再套一层 WebView。
 * 画不出来时显示 SMILES 原文——**看不到图比看到一张错的图安全**，
 * 而且读不出的结构本身就是需要用户知道的信息。
 */
export function Structure({ smiles, height = 150 }: { smiles: string; height?: number }) {
  const [state, setState] = useState<
    | { kind: "molecule"; svgs: string[] }
    | { kind: "reaction"; reactants: string[]; products: string[] }
    | { kind: "error"; error: string }
    | null
  >(null);

  useEffect(() => {
    let cancelled = false;
    depict(smiles, 240, height)
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) return setState({ kind: "error", error: result.error ?? "画不出来" });
        if (result.is_reaction) {
          setState({ kind: "reaction", reactants: result.reactants ?? [], products: result.products ?? [] });
        } else {
          setState({ kind: "molecule", svgs: result.svgs ?? [] });
        }
      })
      .catch((error: unknown) =>
        cancelled ? undefined : setState({ kind: "error", error: error instanceof Error ? error.message : String(error) }),
      );
    return () => {
      cancelled = true;
    };
  }, [smiles, height]);

  if (!state) {
    return (
      <View style={[styles.frame, { height }]}>
        <ActivityIndicator size="small" color={theme.textDim} />
      </View>
    );
  }

  if (state.kind === "error") {
    return (
      <View style={[styles.frame, { minHeight: 48 }]}>
        <Text style={styles.fallback} numberOfLines={2}>
          {smiles}
        </Text>
        <Text style={styles.error}>{state.error}</Text>
      </View>
    );
  }

  if (state.kind === "reaction") {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reactionScroll} contentContainerStyle={[styles.reaction, { minHeight: height }]}>
        <MoleculeGroup svgs={state.reactants} height={height} />
        <View style={styles.arrow}>
          <Ionicons name="arrow-forward" size={22} color={theme.accent} />
        </View>
        <MoleculeGroup svgs={state.products} height={height} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.row}>
      {state.svgs.map((svg, index) => (
        <View key={index} style={styles.tile}>
          <SvgXml xml={svg} width={Math.min(220, height * 1.5)} height={height * 0.86} />
        </View>
      ))}
    </View>
  );
}

function MoleculeGroup({ svgs, height }: { svgs: string[]; height: number }) {
  return (
    <View style={styles.group}>
      {svgs.map((svg, index) => (
        <View key={index} style={styles.component}>
          {index > 0 ? <Text style={styles.plus}>+</Text> : null}
          <View style={styles.tile}><SvgXml xml={svg} width={112} height={height * 0.74} /></View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: theme.radius,
    padding: theme.space(3),
    gap: theme.space(1),
  },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: theme.space(2), backgroundColor: "#ffffff", borderRadius: 14, padding: theme.space(2) },
  reactionScroll: { backgroundColor: "#ffffff", borderRadius: 14 },
  reaction: { alignItems: "center", paddingHorizontal: theme.space(2.5), paddingVertical: theme.space(1) },
  group: { flexDirection: "row", alignItems: "center" },
  component: { flexDirection: "row", alignItems: "center" },
  plus: { color: theme.textDim, fontSize: 17, marginHorizontal: 2 },
  arrow: { width: 42, alignItems: "center", justifyContent: "center" },
  tile: { alignItems: "center", justifyContent: "center" },
  fallback: { color: theme.text, fontSize: 12, fontFamily: "Menlo", textAlign: "center" },
  error: { color: theme.textDim, fontSize: 11 },
});
