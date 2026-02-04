# AIGNE Hub Intent

> 项目级 Intent 入口，聚合各模块与历史规格文档

状态: draft
最后更新: 2026-01-27

## 愿景

为 AIGNE Hub 提供清晰、可维护的 Intent 驱动开发结构，让需求、设计与实现保持一致。

## 架构概览

```
repo
├── intent/                # 项目级 Intent 入口
│   ├── INTENT.md
│   └── architecture/
│       ├── DEPENDENCIES.md
│       └── BOUNDARIES.md
├── blocklets/
└── packages/
```

## 模块索引

| 模块 | 职责 | Intent |
|------|------|--------|
| blocklets/core | Blocklet 核心业务与 API | 待补充 |
| packages/ai-kit | AI 能力与组件库 | 待补充 |

## 现有规格引用

- 用户页面重构规格：`intent/20260120-project-view/intend.md`

## 非目标

- 当前不强制所有模块立即补齐 Intent
- 不改变现有文档位置与命名

## 约束

- 保持现有文档与代码结构不变
- 后续补齐模块 Intent 时尽量与现有实现对齐
