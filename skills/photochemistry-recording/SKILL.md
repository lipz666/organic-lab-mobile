---
name: photochemistry-recording
description: "Capture the light-setup fields that decide whether a photochemical result reproduces."
version: 1.0.0
metadata:
  hermes:
    tags: [photochemistry, 光化学, light, 光源, wavelength, 波长, degassing, 脱气, LED]
    related_skills: []
---

# 光化学实验记录规范

除常规实验字段外，必须询问或标记缺失的灯源型号、波长/带宽、功率或辐照度、灯距、反应器、容器、冷却、实际温度、气氛、脱气与 batch/flow 参数。

## 为什么对光源特别较真

这个领域最大的重复性杀手是光源。「450 nm 蓝光」这句话本身什么都不是——
功率、灯距、反应器材质与光程、是否风冷、LED 用了多久有没有衰减，
每一项都能让结果差一倍。

所以研究者报条件时如果漏了这些，**主动问**，而不是默默记下一个不完整的条件。

## 必须抓或必须追问的字段

光源型号与品牌、峰值波长与带宽、标称功率或实测辐照度、灯距、
反应器类型与容器材质、冷却方式、**实际**反应温度（不是设定值）、
气氛、脱气方式（freeze-pump-thaw 几次 / 鼓气多久）、batch 还是 flow（flow 还要流速和停留时间）。

## 光源会衰减

同一台 Kessil 半年后的实际辐照度和当初不是一回事。讨论「为什么这次没重复出来」时，
**光源标定状态是第一个该问的**，排在换批次试剂和操作差异前面。
