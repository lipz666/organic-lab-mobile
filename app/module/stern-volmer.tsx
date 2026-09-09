import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import { fitSternVolmer, parsePairs, type SternVolmerFit } from "../../src/photo/sternVolmer";
import { ScatterFitChart } from "../../src/ui/charts";
import { Block, Caution, ModuleShell, Readout } from "../../src/ui/ModuleShell";
import { theme } from "../../src/ui/theme";

/**
 * Stern–Volmer 拟合。
 *
 * 拟合本身是确定性的；这一页的价值在于把「拟合得好不好」摆出来：
 * 截距是否接近 1、R² 多少、哪些点残差偏大。这些恰恰是只看 KSV 会漏掉的信息。
 */

const SAMPLE = `0, 1000
0.002, 806.5
0.004, 675.7
0.006, 581.4
0.008, 510.2
0.010, 454.5`;

type InputMode = "intensity" | "ratio";

export default function SternVolmerScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(width - theme.space(4) * 2 - theme.space(6), 240);

  const [raw, setRaw] = useState("");
  const [mode, setMode] = useState<InputMode>("intensity");
  const [lifetime, setLifetime] = useState("");

  const outcome = useMemo((): { fit: SternVolmerFit } | { error: string } | null => {
    if (!raw.trim()) return null;
    const pairs = parsePairs(raw);
    if (pairs.a.length < 3) return { error: "至少需要 3 个数据点" };
    const lifetimeNs = Number(lifetime);
    try {
      return {
        fit: fitSternVolmer({
          concentrations: pairs.a,
          ...(mode === "intensity" ? { intensities: pairs.b } : { ratios: pairs.b }),
          lifetimeNs: Number.isFinite(lifetimeNs) && lifetimeNs > 0 ? lifetimeNs : undefined,
        }),
      };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }, [raw, mode, lifetime]);

  const fit = outcome && "fit" in outcome ? outcome.fit : null;

  return (
    <ModuleShell
      title="Stern–Volmer"
      lead="粘贴猝灭数据做线性拟合。I₀/I = 1 + KSV[Q]，截距与 R² 一并给出——只看 KSV 会漏掉数据本身的问题。"
    >
      <Block title="数据" hint="两列：[Q] 与强度（或比值）">
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.mode, mode === "intensity" && styles.modeActive]}
            onPress={() => setMode("intensity")}
          >
            <Text style={[styles.modeText, mode === "intensity" && styles.modeTextActive]}>第二列是强度 I</Text>
          </Pressable>
          <Pressable style={[styles.mode, mode === "ratio" && styles.modeActive]} onPress={() => setMode("ratio")}>
            <Text style={[styles.modeText, mode === "ratio" && styles.modeTextActive]}>第二列是 I₀/I</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.textarea}
          value={raw}
          onChangeText={setRaw}
          placeholder={"0, 1000\n0.002, 806.5\n..."}
          placeholderTextColor={theme.textFaint}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.rowBetween}>
          <Text style={styles.count}>{raw.trim() ? `${parsePairs(raw).a.length} 个数据点` : "尚未输入"}</Text>
          <Pressable onPress={() => setRaw(SAMPLE)}>
            <Text style={styles.link}>填入示例数据</Text>
          </Pressable>
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>
            激发态寿命 <Text style={styles.fieldUnit}>/ ns（可选，用于算 kq）</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={lifetime}
            onChangeText={setLifetime}
            keyboardType="decimal-pad"
            placeholder="留空则不算 kq"
            placeholderTextColor={theme.textFaint}
          />
        </View>
      </Block>

      {outcome && "error" in outcome && <Caution items={[outcome.error]} tone="danger" />}

      {fit && (
        <>
          <Block title="拟合">
            <View style={styles.chartCard}>
              <ScatterFitChart
                points={fit.points.map((point) => ({ x: point.quencherConcentration, y: point.ratio }))}
                slope={fit.slope}
                intercept={fit.intercept}
                outlierIndices={fit.outlierIndices}
                width={chartWidth}
              />
            </View>
          </Block>

          <Block title="结果">
            <View style={styles.row}>
              <Readout label="KSV" value={formatNumber(fit.ksv)} unit="M⁻¹" />
              <Readout
                label="截距"
                value={fit.intercept.toFixed(3)}
                hint={Math.abs(fit.intercept - 1) > 0.15 ? "理论值应接近 1" : "接近理论值 1"}
              />
              <Readout label="R²" value={fit.rSquared.toFixed(4)} />
              {fit.kqPerMPerS !== null && (
                <Readout label="kq" value={fit.kqPerMPerS.toExponential(2)} unit="M⁻¹s⁻¹" />
              )}
            </View>
          </Block>

          {fit.outlierIndices.length > 0 && (
            <Block title="残差偏大的点" hint="图中空心红圈">
              <View style={styles.outliers}>
                {fit.outlierIndices.map((index) => (
                  <Text key={index} style={styles.outlierItem}>
                    第 {index + 1} 点：[Q] = {formatNumber(fit.points[index].quencherConcentration)}，
                    I₀/I = {fit.points[index].ratio.toFixed(3)}，残差 {fit.residuals[index].toFixed(3)}
                  </Text>
                ))}
              </View>
            </Block>
          )}

          <Caution items={fit.warnings} />
        </>
      )}
    </ModuleShell>
  );
}

function formatNumber(value: number): string {
  const absolute = Math.abs(value);
  if (absolute >= 10000 || (absolute > 0 && absolute < 0.001)) return value.toExponential(2);
  return Number(value.toPrecision(4)).toString();
}

const styles = StyleSheet.create({
  modeRow: { flexDirection: "row", gap: theme.space(2.5) },
  mode: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingVertical: theme.space(2.5),
    alignItems: "center",
    backgroundColor: theme.surface,
  },
  modeActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  modeText: { color: theme.textDim, fontSize: 12.5 },
  modeTextActive: { color: theme.text, fontWeight: "600" },
  textarea: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    padding: theme.space(3),
    fontSize: 13,
    minHeight: 120,
    textAlignVertical: "top",
    fontFamily: "Menlo",
  },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  count: { color: theme.textFaint, fontSize: 11 },
  link: { color: theme.accent, fontSize: 12 },
  row: { flexDirection: "row", gap: theme.space(2.5), flexWrap: "wrap" },
  field: { gap: theme.space(1.5) },
  fieldLabel: { color: theme.textDim, fontSize: 11 },
  fieldUnit: { color: theme.textFaint },
  input: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2.5),
    fontSize: 16,
  },
  chartCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3),
  },
  outliers: {
    backgroundColor: theme.surfaceAlt,
    borderRadius: theme.radius,
    padding: theme.space(3),
    gap: theme.space(1),
  },
  outlierItem: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
});
