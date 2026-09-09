import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { photonBudget } from "../../src/photo/photon";
import { Block, Caution, ModuleShell, Readout } from "../../src/ui/ModuleShell";
import { theme } from "../../src/ui/theme";

/**
 * 光子预算计算器。
 *
 * 整个页面的重点是那个「光功率还是电功率」的开关：选了电功率就算不出通量，
 * 这不是功能缺失而是刻意的——标称 30 W 算出来的 photon flux 看起来和真的一样，
 * 一旦写进记录就再也分不出来。
 */

type PowerMode = "optical" | "electrical";

export default function PhotonScreen() {
  const [wavelength, setWavelength] = useState("450");
  const [power, setPower] = useState("100");
  const [unit, setUnit] = useState<"mW" | "W">("mW");
  const [mode, setMode] = useState<PowerMode>("optical");
  const [efficiency, setEfficiency] = useState("");
  const [hours, setHours] = useState("12");
  const [substrate, setSubstrate] = useState("0.2");

  const result = useMemo(() => {
    const wavelengthNm = Number(wavelength);
    const powerValue = Number(power);
    if (!Number.isFinite(wavelengthNm) || wavelengthNm <= 0) return null;
    if (!Number.isFinite(powerValue) || powerValue <= 0) return null;

    const assumed = Number(efficiency);
    try {
      return photonBudget({
        wavelengthNm,
        powerValue,
        powerUnit: unit,
        powerKind: mode === "optical" ? "optical_measured" : "electrical_nominal",
        assumedOpticalEfficiency:
          mode === "electrical" && Number.isFinite(assumed) && assumed > 0 && assumed <= 1 ? assumed : undefined,
        hours: Number.isFinite(Number(hours)) && Number(hours) > 0 ? Number(hours) : undefined,
        substrateMmol:
          Number.isFinite(Number(substrate)) && Number(substrate) > 0 ? Number(substrate) : undefined,
      });
    } catch {
      return null;
    }
  }, [wavelength, power, unit, mode, efficiency, hours, substrate]);

  return (
    <ModuleShell
      title="光子预算"
      lead="由波长和光功率算出光子能量、通量、剂量与当量。每一步都是公式计算，结果可复现。"
    >
      <Block title="输入">
        <View style={styles.row}>
          <Field label="波长" unit="nm" value={wavelength} onChange={setWavelength} />
          <Field label="功率" unit={unit} value={power} onChange={setPower} />
          <Pressable style={styles.unitToggle} onPress={() => setUnit(unit === "mW" ? "W" : "mW")}>
            <Text style={styles.unitToggleText}>{unit}</Text>
          </Pressable>
        </View>

        <View style={styles.modeRow}>
          <ModeButton
            label="实测光功率"
            hint="功率计在样品位置测到的"
            active={mode === "optical"}
            onPress={() => setMode("optical")}
          />
          <ModeButton
            label="标称电功率"
            hint="灯铭牌上的瓦数"
            active={mode === "electrical"}
            onPress={() => setMode("electrical")}
          />
        </View>

        {mode === "electrical" && (
          <View style={styles.row}>
            <Field
              label="假设光电转换效率"
              unit="0–1"
              value={efficiency}
              onChange={setEfficiency}
              placeholder="留空则不估算"
            />
          </View>
        )}

        <View style={styles.row}>
          <Field label="照射时间" unit="h" value={hours} onChange={setHours} />
          <Field label="底物" unit="mmol" value={substrate} onChange={setSubstrate} />
        </View>
      </Block>

      {result && (
        <>
          <Block title="光子能量" hint="E = hc / λ">
            <View style={styles.row}>
              <Readout label="每摩尔光子" value={result.energy.energyPerMolKJ.toFixed(1)} unit="kJ/mol" />
              <Readout label="单光子" value={result.energy.energyEv.toFixed(2)} unit="eV" />
            </View>
          </Block>

          <Block title="光子通量" hint="Φ = P / E">
            {result.flux.molPhotonsPerSecond === null ? (
              <View style={styles.blocked}>
                <Text style={styles.blockedTitle}>算不出来</Text>
                <Text style={styles.blockedBody}>
                  给出的是标称电功率。它和落到样品上的光功率之间隔着发光效率、配光和几何，
                  通常差一个数量级——用它算出的通量是假的。
                </Text>
                <Text style={styles.blockedHint}>
                  用功率计在样品位置实测，或在上面填一个明确的假设效率（结果会标成估算值）。
                </Text>
              </View>
            ) : (
              <View style={styles.row}>
                <Readout
                  label="入射光子通量"
                  value={result.flux.molPhotonsPerSecond.toExponential(2)}
                  unit="mol/s"
                  hint={result.flux.provenance.sourceKind === "estimated" ? "估算值，非实测" : "由实测光功率算出"}
                />
                <Readout
                  label="等效光功率"
                  value={(result.flux.opticalPowerW ?? 0).toFixed(3)}
                  unit="W"
                />
              </View>
            )}
          </Block>

          {result.dose && (
            <Block title="光子剂量与当量">
              <View style={styles.row}>
                <Readout label="光子总量" value={result.dose.molPhotons.toExponential(2)} unit="mol" />
                {result.equivalents && (
                  <Readout
                    label="入射光子当量"
                    value={result.equivalents.incidentEquivalents.toFixed(1)}
                    unit="equiv"
                    hint="相对底物；不是被吸收当量"
                  />
                )}
              </View>
            </Block>
          )}

          <Caution items={result.warnings} tone={result.flux.molPhotonsPerSecond === null ? "danger" : "warning"} />
        </>
      )}
    </ModuleShell>
  );
}

function Field({
  label,
  unit,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  unit?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
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
        placeholder={placeholder ?? "0"}
        placeholderTextColor={theme.textFaint}
      />
    </View>
  );
}

function ModeButton({
  label,
  hint,
  active,
  onPress,
}: {
  label: string;
  hint: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.mode, active && styles.modeActive]} onPress={onPress}>
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
      <Text style={[styles.modeHint, active && styles.modeHintActive]}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: theme.space(2.5), flexWrap: "wrap", alignItems: "flex-end" },
  field: { gap: theme.space(1.5), flexGrow: 1, flexBasis: 110 },
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
  unitToggle: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2.5),
    backgroundColor: theme.surfaceAlt,
  },
  unitToggleText: { color: theme.text, fontSize: 14, fontWeight: "600" },
  modeRow: { flexDirection: "row", gap: theme.space(2.5) },
  mode: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3),
    gap: theme.space(0.5),
    backgroundColor: theme.surface,
  },
  modeActive: { borderColor: theme.accent, backgroundColor: theme.accentDim },
  modeLabel: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  modeLabelActive: { color: theme.text },
  modeHint: { color: theme.textFaint, fontSize: 10.5 },
  modeHintActive: { color: theme.textDim },
  blocked: {
    backgroundColor: theme.dangerSoft,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(1.5),
  },
  blockedTitle: { color: theme.danger, fontSize: 14, fontWeight: "700" },
  blockedBody: { color: theme.danger, fontSize: 12.5, lineHeight: 19 },
  blockedHint: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
});
