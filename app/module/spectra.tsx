import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";

import {
  absorptionEdge,
  gaussianEmission,
  parseSpectrum,
  peakWavelength,
  spectralOverlap,
} from "../../src/photo/spectra";
import { Meter, SpectrumChart, type Series } from "../../src/ui/charts";
import { Block, Caution, ModuleShell, Readout } from "../../src/ui/ModuleShell";
import { theme } from "../../src/ui/theme";

/**
 * UV–Vis 与光谱重叠。
 *
 * 大多数人手上只有「450 nm LED」这一个数字而没有实测发射谱，所以这里用高斯近似
 * 生成发射谱并明确标出来。重叠度只回答光谱匹不匹配，不回答反应做不做得成。
 */

const SAMPLE = `380,0.10
400,0.35
420,0.80
440,0.95
450,0.88
460,0.60
480,0.20
500,0.05`;

export default function SpectraScreen() {
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(width - theme.space(4) * 2 - 2, 240);

  const [raw, setRaw] = useState("");
  const [ledPeak, setLedPeak] = useState("450");
  const [ledFwhm, setLedFwhm] = useState("20");

  const absorption = useMemo(
    () => (raw.trim() ? parseSpectrum(raw, "吸收谱", "absorbance") : null),
    [raw],
  );

  const emission = useMemo(() => {
    const peak = Number(ledPeak);
    const fwhm = Number(ledFwhm);
    if (!Number.isFinite(peak) || peak <= 0) return null;
    return gaussianEmission(peak, Number.isFinite(fwhm) && fwhm > 0 ? fwhm : 20);
  }, [ledPeak, ledFwhm]);

  const overlap = useMemo(
    () => (absorption && emission && absorption.points.length > 1 ? spectralOverlap(emission, absorption) : null),
    [absorption, emission],
  );

  const series: Series[] = [];
  if (emission) series.push({ label: `${ledPeak} nm LED（高斯近似）`, points: emission.points, color: theme.accent, filled: true });
  if (absorption && absorption.points.length > 1) {
    series.push({ label: "吸收谱", points: absorption.points, color: theme.text });
  }

  const peak = absorption ? peakWavelength(absorption) : null;
  const edge = absorption ? absorptionEdge(absorption) : null;

  return (
    <ModuleShell
      title="光谱与重叠"
      lead="粘贴 UV–Vis 数据（两列：波长, 吸光度），与 LED 发射谱叠图，算出光子加权重叠度。"
    >
      <Block title="吸收谱数据" hint="逗号、制表符或空格分隔，表头会自动跳过">
        <TextInput
          style={styles.textarea}
          value={raw}
          onChangeText={setRaw}
          placeholder={"wavelength,absorbance\n380,0.10\n400,0.35\n..."}
          placeholderTextColor={theme.textFaint}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
        />
        <View style={styles.rowBetween}>
          <Text style={styles.count}>{absorption ? `${absorption.points.length} 个数据点` : "尚未输入"}</Text>
          <Pressable onPress={() => setRaw(SAMPLE)}>
            <Text style={styles.link}>填入示例数据</Text>
          </Pressable>
        </View>
      </Block>

      <Block title="LED 发射">
        <View style={styles.row}>
          <Field label="峰值波长" unit="nm" value={ledPeak} onChange={setLedPeak} />
          <Field label="半高全宽" unit="nm" value={ledFwhm} onChange={setLedFwhm} />
        </View>
        <Text style={styles.note}>
          没有实测发射谱时用高斯近似。真实 LED 常有肩峰和拖尾，定量比较前建议实测。
        </Text>
      </Block>

      {series.length > 0 && (
        <Block title="叠图" hint={overlap?.overlapRangeNm ? `绿色区间为有效重叠 ${overlap.overlapRangeNm.min}–${overlap.overlapRangeNm.max} nm` : undefined}>
          <View style={styles.chartCard}>
            <SpectrumChart series={series} width={chartWidth - theme.space(6)} highlightRange={overlap?.overlapRangeNm ?? null} />
          </View>
        </Block>
      )}

      {absorption && absorption.points.length > 1 && (
        <Block title="吸收特征">
          <View style={styles.row}>
            <Readout label="λmax" value={peak ? String(peak.wavelengthNm) : "—"} unit="nm" />
            <Readout
              label="吸收边"
              value={edge !== null ? String(edge) : "—"}
              unit="nm"
              hint="峰值 5% 处，操作性定义"
            />
          </View>
        </Block>
      )}

      {overlap && (
        <Block title="光谱重叠">
          <View style={styles.overlapCard}>
            <View style={styles.overlapHead}>
              <Text style={styles.overlapValue}>{(overlap.photonWeightedAbsorbance * 100).toFixed(0)}%</Text>
              <View style={[styles.verdict, verdictStyle(overlap.verdict)]}>
                <Text style={[styles.verdictText, { color: verdictColor(overlap.verdict) }]}>
                  {verdictLabel(overlap.verdict)}
                </Text>
              </View>
            </View>
            <Meter
              value={overlap.photonWeightedAbsorbance}
              color={verdictColor(overlap.verdict)}
              caption="光子加权相对吸光度：发出的光子平均落在吸收带多强的位置"
            />
          </View>
          <Caution items={overlap.warnings} />
        </Block>
      )}
    </ModuleShell>
  );
}

function verdictLabel(verdict: string): string {
  return verdict === "strong" ? "匹配良好" : verdict === "moderate" ? "部分匹配" : verdict === "weak" ? "匹配差" : "数据不足";
}

function verdictColor(verdict: string): string {
  return verdict === "strong" ? theme.success : verdict === "moderate" ? theme.warning : verdict === "weak" ? theme.danger : theme.textDim;
}

function verdictStyle(verdict: string) {
  return {
    backgroundColor:
      verdict === "strong" ? theme.successSoft : verdict === "moderate" ? theme.warningSoft : verdict === "weak" ? theme.dangerSoft : theme.surfaceAlt,
  };
}

function Field({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {unit ? <Text style={styles.fieldUnit}> / {unit}</Text> : null}
      </Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholderTextColor={theme.textFaint}
      />
    </View>
  );
}

const styles = StyleSheet.create({
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
  field: { gap: theme.space(1.5), flexGrow: 1, flexBasis: 120 },
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
  note: { color: theme.textFaint, fontSize: 11, lineHeight: 17 },
  chartCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3),
  },
  overlapCard: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(2.5),
  },
  overlapHead: { flexDirection: "row", alignItems: "center", gap: theme.space(3) },
  overlapValue: { color: theme.text, fontSize: 30, fontWeight: "600" },
  verdict: { borderRadius: 999, paddingHorizontal: theme.space(2.5), paddingVertical: theme.space(1) },
  verdictText: { fontSize: 12, fontWeight: "600" },
});
