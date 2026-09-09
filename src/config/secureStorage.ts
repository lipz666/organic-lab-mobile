/**
 * API Key 的存放位置。
 *
 * 原生端走 expo-secure-store（iOS Keychain / Android Keystore）。
 * Web 端 SecureStore 不可用，这里退化为仅内存保存——刷新就没了。这是刻意的：
 * 宁可让 web 预览每次重填，也不把明文 key 写进 localStorage。
 * Web 只用于开发预览，不是发布目标。
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const SLOT = "organiclab.api_key";

let memoryFallback = "";

export const secureStorageIsPersistent = Platform.OS !== "web";

export async function readApiKey(): Promise<string> {
  if (!secureStorageIsPersistent) return memoryFallback;
  try {
    return (await SecureStore.getItemAsync(SLOT)) ?? "";
  } catch {
    // 设备锁屏或钥匙串暂时不可用时读不到。当作未配置，不要让 app 起不来。
    return "";
  }
}

export async function writeApiKey(key: string): Promise<void> {
  if (!secureStorageIsPersistent) {
    memoryFallback = key;
    return;
  }
  if (key) {
    await SecureStore.setItemAsync(SLOT, key);
  } else {
    await SecureStore.deleteItemAsync(SLOT);
  }
}
