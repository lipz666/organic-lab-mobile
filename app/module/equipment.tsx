import { Ionicons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  addCalibration,
  createLightSource,
  listLightSources,
  type LightSourceDetail,
} from "../../src/db/repo/equipment";
import { Block, Caution, ModuleShell } from "../../src/ui/ModuleShell";
import { theme } from "../../src/ui/theme";

/**
 * 设备记忆。
 *
 * 关键设计是标称值和校准值分开：灯的铭牌终身不变，实测辐照度会随时间漂移。
 * 校准记录**永远追加不覆盖**，这样半年后回看「都是 450 nm 为什么结果不同」
 * 还查得出当时用的是哪一版。
 */

export default function EquipmentScreen() {
  const [sources, setSources] = useState<LightSourceDetail[]>([]);
  const [creating, setCreating] = useState(false);
  const [calibrating, setCalibrating] = useState<LightSourceDetail | null>(null);

  const refresh = useCallback(() => {
    listLightSources().then(setSources);
  }, []);

  useFocusEffect(useCallback(() => refresh(), [refresh]));

  return (
    <ModuleShell
      title="设备记忆"
      lead="登记实验室真实拥有的光源。实验记录以后只需要引用编号，诊断时就能比出「同样 450 nm 为什么结果不同」。"
      footer={
        <View style={styles.footer}>
          <Pressable style={styles.addButton} onPress={() => setCreating(true)}>
            <Ionicons name="add" size={18} color={theme.onAccent} />
            <Text style={styles.addLabel}>登记光源</Text>
          </Pressable>
        </View>
      }
    >
      {sources.length === 0 ? (
        <Caution
          items={["还没有登记任何光源。先把常用的那几盏灯记下来，诊断时才能区分设备差异。"]}
          tone="neutral"
        />
      ) : (
        <Block title={`光源（${sources.length}）`}>
          {sources.map((source) => (
            <SourceCard key={source.id} source={source} onCalibrate={() => setCalibrating(source)} />
          ))}
        </Block>
      )}

      <CreateSourceModal
        visible={creating}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          refresh();
        }}
      />

      <CalibrationModal
        source={calibrating}
        onClose={() => setCalibrating(null)}
        onSaved={() => {
          setCalibrating(null);
          refresh();
        }}
      />
    </ModuleShell>
  );
}

function SourceCard({ source, onCalibrate }: { source: LightSourceDetail; onCalibrate: () => void }) {
  const latest = source.latest;
  const stale = !latest || !latest.calibrationDate;

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        <View style={styles.cardTitleWrap}>
          <Text style={styles.cardTitle}>{source.name}</Text>
          <Text style={styles.cardMeta}>
            {[source.manufacturer, source.model].filter(Boolean).join(" ") || "未填型号"}
            {source.nominalWavelengthNm ? ` · 标称 ${source.nominalWavelengthNm} nm` : ""}
            {source.nominalPowerW ? ` · ${source.nominalPowerW} W（电功率）` : ""}
          </Text>
        </View>
        <View style={[styles.badge, stale ? styles.badgeStale : styles.badgeOk]}>
          <Text style={[styles.badgeText, { color: stale ? theme.warning : theme.success }]}>
            {stale ? "无校准" : `v${latest.version}`}
          </Text>
        </View>
      </View>

      {latest ? (
        <View style={styles.calibration}>
          {latest.peakWavelengthNm !== null && (
            <Metric label="实测峰值" value={`${latest.peakWavelengthNm} nm`} />
          )}
          {latest.opticalPowerMw !== null && (
            <Metric label="光功率" value={`${latest.opticalPowerMw} mW`} />
          )}
          {latest.irradianceMwCm2 !== null && (
            <Metric
              label="辐照度"
              value={`${latest.irradianceMwCm2} mW/cm²${latest.measurementDistanceCm ? ` @ ${latest.measurementDistanceCm} cm` : ""}`}
            />
          )}
          {latest.calibrationDate && <Metric label="校准日期" value={latest.calibrationDate} />}
        </View>
      ) : (
        <Text style={styles.noCalibration}>
          还没有校准记录。没有实测光功率就算不出光子通量——标称电功率不能替代。
        </Text>
      )}

      <View style={styles.cardActions}>
        {source.versions.length > 1 && (
          <Text style={styles.historyHint}>{source.versions.length} 次校准记录</Text>
        )}
        <Pressable style={styles.calibrateButton} onPress={onCalibrate}>
          <Ionicons name="speedometer-outline" size={15} color={theme.accent} />
          <Text style={styles.calibrateLabel}>记一次校准</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CreateSourceModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [wavelength, setWavelength] = useState("");
  const [power, setPower] = useState("");

  const submit = async () => {
    if (!name.trim()) {
      Alert.alert("需要一个编号", "例如 LED-450-01。以后实验记录引用的就是它。");
      return;
    }
    await createLightSource({
      name: name.trim(),
      manufacturer: manufacturer.trim() || null,
      model: model.trim() || null,
      nominalWavelengthNm: Number(wavelength) || null,
      nominalPowerW: Number(power) || null,
    });
    setName("");
    setManufacturer("");
    setModel("");
    setWavelength("");
    setPower("");
    onCreated();
  };

  return (
    <Sheet visible={visible} title="登记光源" onClose={onClose} onSubmit={submit} submitLabel="保存">
      <SheetField label="编号" value={name} onChange={setName} placeholder="LED-450-01" autoFocus />
      <View style={styles.sheetRow}>
        <SheetField label="厂商" value={manufacturer} onChange={setManufacturer} placeholder="Kessil" />
        <SheetField label="型号" value={model} onChange={setModel} placeholder="PR160L" />
      </View>
      <View style={styles.sheetRow}>
        <SheetField label="标称波长 / nm" value={wavelength} onChange={setWavelength} numeric placeholder="450" />
        <SheetField label="标称电功率 / W" value={power} onChange={setPower} numeric placeholder="40" />
      </View>
      <Text style={styles.sheetNote}>
        标称电功率只用于识别设备，不参与光子计算——落到样品上的光功率要靠校准实测。
      </Text>
    </Sheet>
  );
}

function CalibrationModal({
  source,
  onClose,
  onSaved,
}: {
  source: LightSourceDetail | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [peak, setPeak] = useState("");
  const [opticalPower, setOpticalPower] = useState("");
  const [irradiance, setIrradiance] = useState("");
  const [distance, setDistance] = useState("");
  const [method, setMethod] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const submit = async () => {
    if (!source) return;
    await addCalibration(source.id, {
      peakWavelengthNm: Number(peak) || null,
      opticalPowerMw: Number(opticalPower) || null,
      irradianceMwCm2: Number(irradiance) || null,
      measurementDistanceCm: Number(distance) || null,
      calibrationMethod: method.trim() || null,
      calibrationDate: date.trim() || null,
    });
    setPeak("");
    setOpticalPower("");
    setIrradiance("");
    setDistance("");
    setMethod("");
    onSaved();
  };

  return (
    <Sheet
      visible={source !== null}
      title={source ? `${source.name} · 新增校准` : "新增校准"}
      onClose={onClose}
      onSubmit={submit}
      submitLabel="记录"
    >
      <View style={styles.sheetRow}>
        <SheetField label="实测峰值 / nm" value={peak} onChange={setPeak} numeric placeholder="447" />
        <SheetField label="光功率 / mW" value={opticalPower} onChange={setOpticalPower} numeric placeholder="120" />
      </View>
      <View style={styles.sheetRow}>
        <SheetField label="辐照度 / mW·cm⁻²" value={irradiance} onChange={setIrradiance} numeric placeholder="35" />
        <SheetField label="测量距离 / cm" value={distance} onChange={setDistance} numeric placeholder="3" />
      </View>
      <SheetField label="测量方法" value={method} onChange={setMethod} placeholder="热堆功率计 / 化学露光计" />
      <SheetField label="日期" value={date} onChange={setDate} placeholder="YYYY-MM-DD" />
      <Text style={styles.sheetNote}>
        每次校准都是新版本，旧记录会保留——已经做过的实验必须能查到当时用的是哪一版。
      </Text>
    </Sheet>
  );
}

function Sheet({
  visible,
  title,
  children,
  onClose,
  onSubmit,
  submitLabel,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {/* 键盘弹出时把底部抬起来：不这样处理，下面几个字段和提交按钮会被键盘盖住够不到。 */}
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={theme.textDim} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <Pressable style={styles.sheetSubmit} onPress={onSubmit}>
            <Text style={styles.sheetSubmitLabel}>{submitLabel}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetField({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  numeric?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.sheetField}>
      <Text style={styles.sheetLabel}>{label}</Text>
      <TextInput
        style={styles.sheetInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textFaint}
        keyboardType={numeric ? "decimal-pad" : "default"}
        autoFocus={autoFocus}
        autoCapitalize="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    padding: theme.space(3.5),
    gap: theme.space(2.5),
  },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: theme.space(2) },
  cardTitleWrap: { flex: 1, gap: theme.space(0.5) },
  cardTitle: { color: theme.text, fontSize: 16, fontWeight: "600" },
  cardMeta: { color: theme.textDim, fontSize: 12, lineHeight: 18 },
  badge: { borderRadius: 999, paddingHorizontal: theme.space(2), paddingVertical: 2 },
  badgeOk: { backgroundColor: theme.successSoft },
  badgeStale: { backgroundColor: theme.warningSoft },
  badgeText: { fontSize: 11, fontWeight: "700" },
  calibration: { flexDirection: "row", flexWrap: "wrap", gap: theme.space(3) },
  metric: { gap: 1, minWidth: 96 },
  metricLabel: { color: theme.textFaint, fontSize: 10.5 },
  metricValue: { color: theme.text, fontSize: 13.5, fontWeight: "500" },
  noCalibration: { color: theme.warning, fontSize: 12, lineHeight: 18 },
  cardActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  historyHint: { color: theme.textFaint, fontSize: 11 },
  calibrateButton: { flexDirection: "row", alignItems: "center", gap: theme.space(1.5), marginLeft: "auto" },
  calibrateLabel: { color: theme.accent, fontSize: 13 },
  footer: {
    padding: theme.space(4),
    borderTopWidth: 1,
    borderTopColor: theme.border,
    backgroundColor: theme.surface,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space(1.5),
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3.5),
  },
  addLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
  backdrop: { flex: 1, backgroundColor: "rgba(23,23,22,0.35)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.space(4),
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  sheetTitle: { color: theme.text, fontSize: 17, fontWeight: "600" },
  sheetBody: { padding: theme.space(4), gap: theme.space(3) },
  sheetRow: { flexDirection: "row", gap: theme.space(3) },
  sheetField: { flex: 1, gap: theme.space(1.5) },
  sheetLabel: { color: theme.textDim, fontSize: 11 },
  sheetInput: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(2.5),
    fontSize: 15,
  },
  sheetNote: { color: theme.textFaint, fontSize: 11, lineHeight: 17 },
  sheetSubmit: {
    margin: theme.space(4),
    backgroundColor: theme.accent,
    borderRadius: theme.radius,
    paddingVertical: theme.space(3.5),
    alignItems: "center",
  },
  sheetSubmitLabel: { color: theme.onAccent, fontSize: 15, fontWeight: "700" },
});
