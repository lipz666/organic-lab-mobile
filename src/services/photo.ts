/**
 * 拍照/选图 → 压缩 → 拿到 base64 和一份长期保存的副本。
 *
 * 压到长边 1600、JPEG 0.8：足够读清手写字和结构式，同时把 base64 控制在 iOS 上
 * 不至于把整张图撑爆内存的量级。相册和相机返回的临时文件系统随时会清，
 * 所以附件要复制进 document 目录。
 */

import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

const MAX_EDGE = 1600;

export type PreparedPhoto = {
  /** 长期保存的副本，写进 attachments 表。 */
  uri: string;
  base64: string;
  mimeType: string;
};

function attachmentsDirectory(): Directory {
  const directory = new Directory(Paths.document, "attachments");
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

async function prepare(sourceUri: string): Promise<PreparedPhoto> {
  const context = ImageManipulator.manipulate(sourceUri);
  context.resize({ width: MAX_EDGE });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    base64: true,
    compress: 0.8,
    format: SaveFormat.JPEG,
  });

  if (!saved.base64) throw new Error("图片压缩后没有拿到 base64");

  const destination = new File(attachmentsDirectory(), `${Date.now()}.jpg`);
  await new File(saved.uri).copy(destination);

  return { uri: destination.uri, base64: saved.base64, mimeType: "image/jpeg" };
}

/** 返回 null 表示用户取消，不是错误。 */
export async function capturePhoto(): Promise<PreparedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) throw new Error("没有相机权限。到系统设置里允许后再试。");

  const result = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
  if (result.canceled || !result.assets[0]) return null;
  return prepare(result.assets[0].uri);
}

export async function pickPhoto(): Promise<PreparedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("没有相册权限。到系统设置里允许后再试。");

  const result = await ImagePicker.launchImageLibraryAsync({
    quality: 1,
    exif: false,
    mediaTypes: ["images"],
  });
  if (result.canceled || !result.assets[0]) return null;
  return prepare(result.assets[0].uri);
}
