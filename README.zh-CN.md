# Gohan

[English](README.md) | [中文](README.zh-CN.md)

Gohan 是一个面向长生命周期 Agent 和浏览器工作流的开源 runtime control plane。

它关心的是 Agent 已经“能跑起来”之后最容易失控的那一层：

- 一个任务到底在哪个 runtime 上执行
- 一条 runtime event 应该归属到哪个 task run
- Agent 现在是在线、阻塞、等待审批，还是已经真正完成
- 如何在不丢失执行身份的前提下暂停，等待审批或人工补充输入
- 如何把浏览器任务从长期对话状态中隔离出来

Gohan 位于 agent builder、执行环境和平台 API 之间，重点是管理 runtime lifecycle，而不是 prompt orchestration。

## 5 分钟演示

```bash
npm install
python3 -m pip install -r services/probe-bridge/requirements.txt
npm run demo:joint
```

<img src="docs/assets/gohan-control-plane-probe-bridge-demo.gif" alt="Gohan control plane 和 probe bridge 联动演示" width="920" />

这个 joint demo 会启动 control plane 和 probe bridge，并完整走一遍：

1. probe heartbeat
2. task creation
3. task run start
4. probe 原始事件批量上报
5. approval creation
6. approval resolution
7. task completion

更详细的脚本流程、终端录屏和回退到单进程 demo 的方式，见 [docs/LOCAL_DEMO.md](docs/LOCAL_DEMO.md)。
纯文本演示记录见 [docs/assets/gohan-control-plane-probe-bridge-demo.txt](docs/assets/gohan-control-plane-probe-bridge-demo.txt)。

## 为什么会有 Gohan

今天的 Agent 生态在几个层面已经比较成熟：

- SDK 和框架负责搭建 agent
- tracing 工具负责观察执行过程
- browser/tool runtime 负责具体执行

但很多团队真正薄弱的，往往是 runtime control-plane 这一层：

- task 和 run 状态管理
- session id 和 runtime identity 关联
- approval 和 human input 这种人工门控
- browser work 的隔离执行
- remote runtime 的统一接入
- heartbeat 和 online state 的推导

Gohan 想补上的，就是这一层。

## Gohan 的位置

Gohan 不是要替代你周围的一切。

- Agent SDK 负责构建 agent 和工具图
- Temporal / Prefect 负责耐久化业务工作流
- Kubernetes 负责计算和基础设施调度
- Gohan 负责 agent workload 的 runtime lifecycle，包括 `Task`、`TaskRun`、`Approval`、runtime events、probe heartbeat 和 browser-task boundary

换句话说，Gohan 不是“另一个 agent framework”，而是围绕现有 Agent 的 runtime control layer。

## 适合什么场景

当你已经有 Agent，但 runtime state 还是手搓时，可以考虑 Gohan：

- 任务运行状态分散在一堆临时脚本里
- approval 或人工补充输入需要成为一等运行时状态
- 浏览器任务应该走隔离执行链路
- 多个 remote runtime 需要汇总到一个 control plane
- session id、run id、workflow state 正在到处泄漏

## Gohan 不是什么

- 不是另一个 agent SDK
- 不是聊天 UI
- 不是纯 tracing 产品
- 不是通用工作流引擎
- 不是 Kubernetes 替代品

## 核心概念

当前开源版本围绕一组尽量小而明确的 primitive：

- `AgentRuntime`: 被管理的执行目标
- `Task`: 面向用户的工作单元
- `TaskRun`: 某个 task 的具体执行尝试
- `Approval`: 人工审批或补充输入门
- `RuntimeEvent`: 从 probe 或 worker 归一化后的执行事件
- `BrowserTask`: 被路由到专用 worker 的浏览器任务
- `BrowserTaskExecutionResult`: 浏览器任务回传的结构化结果

这些命名后续仍可能继续收敛，但边界已经比较明确。

## 现在已经能工作的部分

这个仓库还很早期，但已经不只是概念和命名：

- 一个 in-memory control-plane app，包含 task、task-run、approval、runtime-event 路由
- 一套公开的 runtime protocol，覆盖 runtime agent、probe heartbeat 和 raw event batch ingestion
- 一个 control-plane + probe-bridge 联动 demo，能走完 heartbeat -> batch ingest -> approval -> completion
- 一个优先使用公开 Gohan 协议的 Python probe bridge baseline
- 一个 browser-worker mock loop，验证执行边界和结构化结果契约
- 本地测试和 GitHub Actions CI

## 当前限制

这是一个早期公开提取版本，所以以下几点同时成立：

- 方向是明确的
- 抽象是真实存在的
- 实现还没有完整到产品态

目前比较重要的限制包括：

- control-plane app 仍然是 demo 级别，底层用的是 in-memory store
- 一些公开接口在真正的 `v0.1` 之前还会继续调整
- deployment 和 persistence 目前刻意保持很薄
- 当前 probe-bridge baseline 仍然偏 OpenClaw，公共 runtime protocol 还在朝更通用的 adapter 方向收敛

## 架构

```text
                 +---------------------------+
                 |      Gohan Control Plane  |
                 |---------------------------|
                 | task API / task runs      |
                 | approvals / runtime state |
                 | event correlation         |
                 +-------------+-------------+
                               |
               +---------------+----------------+
               |                                |
     +---------v---------+            +---------v---------+
     |   Probe Bridge    |            | Browser Worker    |
     |-------------------|            |-------------------|
     | session tracking  |            | isolated runs     |
     | event forwarding  |            | structured output |
     | heartbeat / send  |            | browser-specific  |
     +---------+---------+            +---------+---------+
               |                                |
               v                                v
        remote agent runtime              browser runtime
```

## 仓库结构

```text
gohan/
  apps/
    control-plane/     # in-memory HTTP server，暴露 task / approval / runtime-event 路由
  services/
    probe-bridge/      # Python bridge，负责把远端 runtime event 和 heartbeat 转发给 Gohan
    browser-worker/    # mock browser-task worker，验证隔离执行边界
  packages/
    contracts/         # runtime、control-plane、probe、browser-worker 共享类型
    core/              # runtime 决策逻辑和 task workflow helper
  docs/                # demo、protocol、architecture 和 release 准备文档
```

## 开发

最基础的本地命令：

```bash
npm install
npm run typecheck
npm test
npm run demo
npm run check:release
```

## 文档

- [docs/LOCAL_DEMO.md](docs/LOCAL_DEMO.md): 本地演示流程
- [docs/RUNTIME_PROTOCOL.md](docs/RUNTIME_PROTOCOL.md): control-plane 和执行侧的公开协议
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): 架构说明
- [docs/EXTRACTION_PLAN.md](docs/EXTRACTION_PLAN.md): 首个开源提取边界
- [CONTRIBUTING.md](CONTRIBUTING.md): 贡献说明
- [docs/FIRST_RELEASE_CHECKLIST.md](docs/FIRST_RELEASE_CHECKLIST.md): 首次发布检查清单
- [docs/LICENSE_OPTIONS.md](docs/LICENSE_OPTIONS.md): 协议选择权衡
